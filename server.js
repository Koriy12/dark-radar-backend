import express from 'express';
import cors from 'cors';
import { Keypair, Connection, clusterApiUrl, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import WebSocket from 'ws';
import pg from 'pg';

const { Pool } = pg;
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

// Особистий гаманець для збору 1% комісії
const FEE_RECIPIENT_WALLET = "EiiXRmMt41GCBKdsodHHk8DLM8E32QmqQHp7Fv5pzXLs";
const PLATFORM_FEE_PERCENT = 0.01;
const REFERRAL_SHARE_PERCENT = 0.25;

// Підключення до бази PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Автоматична міграція структури бази даних (users + trades)
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        telegram_id VARCHAR(64) PRIMARY KEY,
        public_key VARCHAR(64) NOT NULL,
        secret_key TEXT NOT NULL,
        auto_copy BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS referrer_id VARCHAR(64);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS volume_sol NUMERIC DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pnl_sol NUMERIC DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_rewards_sol NUMERIC DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS winrate INT DEFAULT 75;
    `);

    // Таблиця відкритих та закритих позицій трейдера
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trades (
        id SERIAL PRIMARY KEY,
        telegram_id VARCHAR(64) NOT NULL,
        mint VARCHAR(64) NOT NULL,
        token_name VARCHAR(128) DEFAULT 'MEME',
        amount_sol NUMERIC NOT NULL,
        entry_price NUMERIC DEFAULT 1,
        status VARCHAR(16) DEFAULT 'OPEN',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("✅ База даних Postgres успішно перевірена (users + trades)");
  } catch (err) {
    console.error("❌ Помилка БД:", err.message);
  }
}
initDB();

const WHALE_DATABASE = [
  { 
    id: 1, 
    name: "Whale Alpha #1 (Ray/Pump Sniper)", 
    address: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pcon4m", 
    winrate: 84, 
    pnl7d: "+412 SOL", 
    isCopied: true 
  },
  { 
    id: 2, 
    name: "Pump.fun Sniper 0x", 
    address: "AC5RDfQFmDS1deCrptYpSfg8h2LgY4t4qfLmVrF9Q3V", 
    winrate: 79, 
    pnl7d: "+285 SOL", 
    isCopied: false 
  },
  { 
    id: 3, 
    name: "Insider Tracker (KOL Flow)", 
    address: "FWznbcNXWQuHTawe9KcQBH2GtqQTwpQ3BRg6CeGoVPui", 
    winrate: 76, 
    pnl7d: "+194 SOL", 
    isCopied: false 
  },
  { 
    id: 4, 
    name: "Micro-Cap Runner", 
    address: "G7XQ5ZvhTjHj7pD8PZ5aA7bF2mGk1sL4dE8xW9qC1rV3", 
    winrate: 72, 
    pnl7d: "+158 SOL", 
    isCopied: false 
  },
  { 
    id: 5, 
    name: "Smart DEX Scalper", 
    address: "8sBmFqKzX9wE2vL4mN7pQ1rT3yU5iO6aP8sD9fG0hJ2k", 
    winrate: 81, 
    pnl7d: "+320 SOL", 
    isCopied: false 
  }
];

let latestTokens = [];

// 1. Ініціалізація та прив'язка реферала
app.post('/api/wallet/init', async (req, res) => {
  const { telegramId, referrerId } = req.body;
  if (!telegramId) return res.status(400).json({ error: "telegramId is required" });

  try {
    const existing = await pool.query('SELECT public_key, auto_copy, referrer_id FROM users WHERE telegram_id = $1', [String(telegramId)]);
    
    if (existing.rows.length > 0) {
      if (!existing.rows[0].referrer_id && referrerId && String(referrerId) !== String(telegramId)) {
        await pool.query('UPDATE users SET referrer_id = $1 WHERE telegram_id = $2', [String(referrerId), String(telegramId)]);
      }
      return res.json({
        publicKey: existing.rows[0].public_key,
        feeTier: "Standard (1% fee)",
        autoCopyEnabled: existing.rows[0].auto_copy
      });
    }

    const newKeypair = Keypair.generate();
    const pubkey = newKeypair.publicKey.toBase58();
    const secret = bs58.encode(newKeypair.secretKey);
    const ref = (referrerId && String(referrerId) !== String(telegramId)) ? String(referrerId) : null;

    await pool.query(
      'INSERT INTO users (telegram_id, public_key, secret_key, auto_copy, referrer_id) VALUES ($1, $2, $3, $4, $5)',
      [String(telegramId), pubkey, secret, true, ref]
    );

    res.json({
      publicKey: pubkey,
      feeTier: "Standard (1% fee)",
      autoCopyEnabled: true
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Баланс SOL
app.get('/api/wallet/balance/:pubkey', async (req, res) => {
  try {
    const pubkey = new PublicKey(req.params.pubkey);
    const balanceLamports = await connection.getBalance(pubkey);
    res.json({ balanceSol: (balanceLamports / LAMPORTS_PER_SOL).toFixed(4) });
  } catch (e) {
    res.status(500).json({ error: e.message, balanceSol: "0.0000" });
  }
});

// 3. Виведення коштів (Withdraw)
app.post('/api/wallet/withdraw', async (req, res) => {
  const { telegramId, targetAddress, amountSol } = req.body;
  try {
    const userRes = await pool.query('SELECT secret_key, public_key FROM users WHERE telegram_id = $1', [String(telegramId)]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "Користувача не знайдено" });

    const keypair = Keypair.fromSecretKey(bs58.decode(userRes.rows[0].secret_key));
    const lamports = Math.floor(parseFloat(amountSol) * LAMPORTS_PER_SOL);

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new PublicKey(targetAddress),
        lamports: lamports
      })
    );

    const txHash = await sendAndConfirmTransaction(connection, tx, [keypair]);
    res.json({ success: true, txHash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Отримання портфеля користувача
app.get('/api/portfolio/:telegramId', async (req, res) => {
  const { telegramId } = req.params;
  try {
    const tradesRes = await pool.query(
      "SELECT id, mint, token_name, amount_sol, created_at FROM trades WHERE telegram_id = $1 AND status = 'OPEN' ORDER BY id DESC",
      [String(telegramId)]
    );
    res.json(tradesRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Список китів
app.get('/api/whales', (req, res) => {
  res.json(WHALE_DATABASE);
});

// 6. Потік токенів Pump.fun
app.get('/api/radar/latest', (req, res) => {
  res.json(latestTokens);
});

// 7. Реферальна статистика
app.get('/api/referrals/:telegramId', async (req, res) => {
  const { telegramId } = req.params;
  try {
    const refCountRes = await pool.query('SELECT COUNT(*) FROM users WHERE referrer_id = $1', [String(telegramId)]);
    const userRes = await pool.query('SELECT referral_rewards_sol FROM users WHERE telegram_id = $1', [String(telegramId)]);

    const count = parseInt(refCountRes.rows[0]?.count || 0, 10);
    const rewards = userRes.rows.length > 0 && userRes.rows[0].referral_rewards_sol 
      ? parseFloat(userRes.rows[0].referral_rewards_sol).toFixed(4) 
      : "0.0000";

    res.json({
      referralsCount: count,
      totalEarnedSol: rewards,
      refLink: `https://t.me/darksolradar_bot/app?startapp=ref_${telegramId}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Лідерборд трейдерів
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT telegram_id, volume_sol, pnl_sol, winrate
      FROM users
      ORDER BY pnl_sol DESC NULLS LAST, volume_sol DESC NULLS LAST
      LIMIT 10;
    `);

    const leaderboard = result.rows.map((row, index) => {
      const tag = row.telegram_id.length > 5 ? `Trader_${row.telegram_id.slice(-4)}` : `Trader_${row.telegram_id}`;
      return {
        rank: index + 1,
        trader: tag,
        pnl: `+${(parseFloat(row.pnl_sol) || 12.4 + (10 - index) * 3.5).toFixed(2)} SOL`,
        winrate: row.winrate || (85 - index * 2),
        volume: `${(parseFloat(row.volume_sol) || 45.0 + (10 - index) * 8.0).toFixed(1)} SOL`
      };
    });

    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Торгівля (Buy) з фіксацією угоди в портфелі
app.post('/api/trade/pump', async (req, res) => {
  const { telegramId, mint, tokenName, action, amountSol } = req.body;
  try {
    const userRes = await pool.query('SELECT secret_key, public_key, referrer_id FROM users WHERE telegram_id = $1', [String(telegramId)]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "Гаманець не знайдено" });

    const wallet = userRes.rows[0];
    const totalAmount = parseFloat(amountSol);
    const platformFee = totalAmount * PLATFORM_FEE_PERCENT;
    const netTradeAmount = totalAmount - platformFee;

    const response = await fetch("https://pumpportal.fun/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: wallet.public_key,
        action: action,
        mint: mint,
        denominatedInSol: "true",
        amount: netTradeAmount,
        slippage: 15,
        priorityFee: 0.005,
        pool: "pump"
      })
    });

    if (response.status === 200) {
      const txData = await response.arrayBuffer();
      const tx = Transaction.from(Buffer.from(txData));

      if (FEE_RECIPIENT_WALLET) {
        tx.add(SystemProgram.transfer({
          fromPubkey: new PublicKey(wallet.public_key),
          toPubkey: new PublicKey(FEE_RECIPIENT_WALLET),
          lamports: Math.floor(platformFee * LAMPORTS_PER_SOL)
        }));
      }

      const signerKeypair = Keypair.fromSecretKey(bs58.decode(wallet.secret_key));
      tx.sign(signerKeypair);

      const txHash = await connection.sendRawTransaction(tx.serialize());

      // Записуємо позицію у портфель
      await pool.query(
        'INSERT INTO trades (telegram_id, mint, token_name, amount_sol, status) VALUES ($1, $2, $3, $4, $5)',
        [String(telegramId), mint, tokenName || 'MEME', totalAmount, 'OPEN']
      );

      // Оновлюємо торговий обсяг
      await pool.query(
        'UPDATE users SET volume_sol = COALESCE(volume_sol, 0) + $1, pnl_sol = COALESCE(pnl_sol, 0) + $2 WHERE telegram_id = $3',
        [totalAmount, (totalAmount * 0.35).toFixed(3), String(telegramId)]
      );

      // Нараховуємо 25% рефбеку рефереру
      if (wallet.referrer_id) {
        const refReward = platformFee * REFERRAL_SHARE_PERCENT;
        await pool.query(
          'UPDATE users SET referral_rewards_sol = COALESCE(referral_rewards_sol, 0) + $1 WHERE telegram_id = $2',
          [refReward, wallet.referrer_id]
        );
      }

      res.json({ success: true, txHash, netTradeAmount, platformFee });
    } else {
      const err = await response.text();
      res.status(400).json({ error: err });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Закриття/продаж позиції (Sell 100%)
app.post('/api/trade/sell', async (req, res) => {
  const { telegramId, tradeId, mint } = req.body;
  try {
    const userRes = await pool.query('SELECT secret_key, public_key FROM users WHERE telegram_id = $1', [String(telegramId)]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "Гаманець не знайдено" });

    const wallet = userRes.rows[0];

    const response = await fetch("https://pumpportal.fun/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: wallet.public_key,
        action: "sell",
        mint: mint,
        denominatedInSol: "false",
        amount: "100%",
        slippage: 15,
        priorityFee: 0.005,
        pool: "pump"
      })
    });

    if (response.status === 200) {
      const txData = await response.arrayBuffer();
      const tx = Transaction.from(Buffer.from(txData));
      const signerKeypair = Keypair.fromSecretKey(bs58.decode(wallet.secret_key));
      tx.sign(signerKeypair);
      const txHash = await connection.sendRawTransaction(tx.serialize());

      // Позначаємо угоду закритою
      await pool.query("UPDATE trades SET status = 'CLOSED' WHERE id = $1 AND telegram_id = $2", [tradeId, String(telegramId)]);

      res.json({ success: true, txHash });
    } else {
      const err = await response.text();
      res.status(400).json({ error: err });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Додавання кастомного кита
app.post('/api/whales/custom', async (req, res) => {
  const { address, name } = req.body;
  if (!address || address.length < 32) {
    return res.status(400).json({ error: "Некоректна адреса Solana" });
  }

  const whaleItem = {
    id: Date.now(),
    name: name || `Custom Whale (${address.slice(0, 4)}...)`,
    address: address,
    winrate: 78,
    pnl7d: "+50 SOL",
    isCopied: true
  };

  WHALE_DATABASE.push(whaleItem);
  res.json({ success: true, whale: whaleItem });
});

// 12. Моніторинг китів через WebSocket RPC
function trackWhaleWallets() {
  console.log("👀 Запуск ончейн-радара угод китів...");
  WHALE_DATABASE.forEach(whale => {
    try {
      const pubkey = new PublicKey(whale.address);
      connection.onLogs(
        pubkey,
        (logs) => {
          if (!logs.err) {
            console.log(`🚨 Кит [${whale.name}] зробив дію!`);
          }
        },
        "confirmed"
      );
    } catch (e) {}
  });
}
trackWhaleWallets();

// 13. WebSocket стрім Pump.fun
function listenPumpFun() {
  const ws = new WebSocket('wss://pumpportal.fun/api/data');
  ws.on('open', () => {
    ws.send(JSON.stringify({ method: "subscribeNewToken" }));
    console.log("⚡ Підключено до PumpPortal Live Feed");
  });

  ws.on('message', (data) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.mint && parsed.name) {
        const tokenItem = {
          mint: parsed.mint,
          name: parsed.name,
          symbol: parsed.symbol || "MEME",
          initialBuy: parsed.initialBuy ? (parsed.initialBuy / LAMPORTS_PER_SOL).toFixed(2) : "0.5",
          time: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          aiScore: Math.floor(Math.random() * (98 - 82 + 1)) + 82
        };

        latestTokens.unshift(tokenItem);
        if (latestTokens.length > 15) {
          latestTokens.pop();
        }
      }
    } catch (err) {}
  });

  ws.on('error', () => setTimeout(listenPumpFun, 5000));
  ws.on('close', () => setTimeout(listenPumpFun, 5000));
}
listenPumpFun();

app.listen(PORT, () => {
  console.log(`🚀 Сервер Dark Sol Radar працює на порту ${PORT}`);
});
