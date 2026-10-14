import express from 'express';
import cors from 'cors';
import { 
  Keypair, 
  Connection, 
  clusterApiUrl, 
  PublicKey, 
  Transaction, 
  VersionedTransaction, 
  SystemProgram, 
  LAMPORTS_PER_SOL, 
  sendAndConfirmTransaction 
} from '@solana/web3.js';
import bs58 from 'bs58';
import WebSocket from 'ws';
import pg from 'pg';

const { Pool } = pg;
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
// Для переходу на реальну мережу замініть 'devnet' на 'mainnet-beta'
const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

const FEE_RECIPIENT_WALLET = "EiiXRmMt41GCBKdsodHHk8DLM8E32QmqQHp7Fv5pzXLs";
const PLATFORM_FEE_PERCENT = 0.01;
const REFERRAL_SHARE_PERCENT = 0.25;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        telegram_id VARCHAR(64) PRIMARY KEY,
        public_key VARCHAR(64) NOT NULL,
        secret_key TEXT NOT NULL,
        auto_copy BOOLEAN DEFAULT true,
        balance_sol NUMERIC DEFAULT 0.5,
        referrer_id VARCHAR(64),
        volume_sol NUMERIC DEFAULT 0,
        pnl_sol NUMERIC DEFAULT 0,
        referral_rewards_sol NUMERIC DEFAULT 0,
        winrate INT DEFAULT 75,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS trades (
        id SERIAL PRIMARY KEY,
        telegram_id VARCHAR(64) NOT NULL,
        mint VARCHAR(64) NOT NULL,
        token_name VARCHAR(128) DEFAULT 'MEME',
        entry_price_sol NUMERIC NOT NULL,
        amount_sol NUMERIC NOT NULL,
        remaining_amount_sol NUMERIC NOT NULL,
        take_profit_pct INT DEFAULT NULL,
        stop_loss_pct INT DEFAULT NULL,
        status VARCHAR(16) DEFAULT 'OPEN',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS balance_sol NUMERIC DEFAULT 0.5;
      ALTER TABLE trades ADD COLUMN IF NOT EXISTS entry_price_sol NUMERIC DEFAULT 0.00000003;
      ALTER TABLE trades ADD COLUMN IF NOT EXISTS remaining_amount_sol NUMERIC;
      ALTER TABLE trades ADD COLUMN IF NOT EXISTS take_profit_pct INT;
      ALTER TABLE trades ADD COLUMN IF NOT EXISTS stop_loss_pct INT;
    `);

    console.log("✅ Біржовий реєстр успішно ініціалізовано");
  } catch (err) {
    console.error("❌ Помилка ініціалізації БД:", err.message);
  }
}
initDB();

const WHALE_DATABASE = [
  { id: 1, name: "Whale Alpha #1 (Ray/Pump Sniper)", address: "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pcon4m", winrate: 84, pnl7d: "+412 SOL", isCopied: true },
  { id: 2, name: "Pump.fun Sniper 0x", address: "AC5RDfQFmDS1deCrptYpSfg8h2LgY4t4qfLmVrF9Q3V", winrate: 79, pnl7d: "+285 SOL", isCopied: false },
  { id: 3, name: "Insider Tracker (KOL Flow)", address: "FWznbcNXWQuHTawe9KcQBH2GtqQTwpQ3BRg6CeGoVPui", winrate: 76, pnl7d: "+194 SOL", isCopied: false },
  { id: 4, name: "Micro-Cap Runner", address: "G7XQ5ZvhTjHj7pD8PZ5aA7bF2mGk1sL4dE8xW9qC1rV3", winrate: 72, pnl7d: "+158 SOL", isCopied: false },
  { id: 5, name: "Smart DEX Scalper", address: "8sBmFqKzX9wE2vL4mN7pQ1rT3yU5iO6aP8sD9fG0hJ2k", winrate: 81, pnl7d: "+320 SOL", isCopied: false }
];

let latestTokens = [];
const priceMemoryCache = new Map();

// 1. Авторизація / створення гаманця
app.post('/api/wallet/init', async (req, res) => {
  const { telegramId, referrerId } = req.body;
  if (!telegramId) return res.status(400).json({ error: "telegramId is required" });

  try {
    const existing = await pool.query('SELECT public_key, auto_copy, referrer_id, balance_sol FROM users WHERE telegram_id = $1', [String(telegramId)]);
    if (existing.rows.length > 0) {
      if (!existing.rows[0].referrer_id && referrerId && String(referrerId) !== String(telegramId)) {
        await pool.query('UPDATE users SET referrer_id = $1 WHERE telegram_id = $2', [String(referrerId), String(telegramId)]);
      }
      return res.json({
        publicKey: existing.rows[0].public_key,
        feeTier: "Standard (1% fee)",
        autoCopyEnabled: existing.rows[0].auto_copy,
        balanceSol: parseFloat(existing.rows[0].balance_sol || 0.5).toFixed(4)
      });
    }

    const newKeypair = Keypair.generate();
    const pubkey = newKeypair.publicKey.toBase58();
    const secret = bs58.encode(newKeypair.secretKey);
    const ref = (referrerId && String(referrerId) !== String(telegramId)) ? String(referrerId) : null;

    await pool.query(
      'INSERT INTO users (telegram_id, public_key, secret_key, auto_copy, balance_sol, referrer_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [String(telegramId), pubkey, secret, true, 0.5, ref]
    );

    res.json({
      publicKey: pubkey,
      feeTier: "Standard (1% fee)",
      autoCopyEnabled: true,
      balanceSol: "0.5000"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Баланс користувача
app.get('/api/wallet/balance/:telegramId', async (req, res) => {
  try {
    const userRes = await pool.query('SELECT balance_sol FROM users WHERE telegram_id = $1', [String(req.params.telegramId)]);
    if (userRes.rows.length === 0) return res.json({ balanceSol: "0.0000" });
    res.json({ balanceSol: parseFloat(userRes.rows[0].balance_sol || 0).toFixed(4) });
  } catch (e) {
    res.status(500).json({ error: e.message, balanceSol: "0.0000" });
  }
});

// 3. Реальна ринкова ціна токена
app.get('/api/token/price/:mint', async (req, res) => {
  const { mint } = req.params;
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (response.ok) {
      const data = await response.json();
      if (data.pairs && data.pairs.length > 0) {
        const pair = data.pairs[0];
        const priceSol = parseFloat(pair.priceNative || 0.00000005);
        priceMemoryCache.set(mint, priceSol);
        return res.json({
          priceSol,
          priceUsd: pair.priceUsd || "0.00001",
          priceChange5m: pair.priceChange?.m5 || 0,
          marketCap: pair.marketCap || 15000
        });
      }
    }

    let trackedPrice = priceMemoryCache.get(mint);
    if (!trackedPrice) {
      trackedPrice = 0.000000030;
      priceMemoryCache.set(mint, trackedPrice);
    }
    res.json({
      priceSol: trackedPrice,
      priceUsd: (trackedPrice * 180).toFixed(6),
      priceChange5m: 0.0,
      marketCap: Math.round(trackedPrice * 1000000000 * 180)
    });
  } catch (e) {
    res.json({ priceSol: 0.00000003, priceChange5m: 0 });
  }
});

// 4. Отримання списку позицій
app.get('/api/portfolio/:telegramId', async (req, res) => {
  const { telegramId } = req.params;
  try {
    const tradesRes = await pool.query(
      "SELECT id, mint, token_name, amount_sol, remaining_amount_sol, entry_price_sol, take_profit_pct, stop_loss_pct, created_at FROM trades WHERE telegram_id = $1 AND status = 'OPEN' ORDER BY id DESC",
      [String(telegramId)]
    );
    res.json(tradesRes.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Встановлення TP/SL
app.post('/api/portfolio/limits', async (req, res) => {
  const { tradeId, telegramId, tp, sl } = req.body;
  try {
    await pool.query(
      "UPDATE trades SET take_profit_pct = $1, stop_loss_pct = $2 WHERE id = $3 AND telegram_id = $4",
      [tp ? parseInt(tp, 10) : null, sl ? parseInt(sl, 10) : null, tradeId, String(telegramId)]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Купівля: точне списання балансу
app.post('/api/trade/pump', async (req, res) => {
  const { telegramId, mint, tokenName, amountSol } = req.body;
  try {
    const userRes = await pool.query('SELECT balance_sol, referrer_id FROM users WHERE telegram_id = $1', [String(telegramId)]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "Користувача не знайдено" });

    const currentBal = parseFloat(userRes.rows[0].balance_sol || 0);
    const totalAmount = parseFloat(amountSol);

    if (currentBal < totalAmount) {
      return res.status(400).json({ error: "Недостатньо коштів на балансі" });
    }

    const platformFee = totalAmount * PLATFORM_FEE_PERCENT;
    const newBalance = currentBal - totalAmount;
    const entryPrice = priceMemoryCache.get(mint) || 0.000000030;

    await pool.query(
      'UPDATE users SET balance_sol = $1, volume_sol = COALESCE(volume_sol, 0) + $2 WHERE telegram_id = $3', 
      [newBalance.toFixed(4), totalAmount, String(telegramId)]
    );

    await pool.query(
      'INSERT INTO trades (telegram_id, mint, token_name, entry_price_sol, amount_sol, remaining_amount_sol, status) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [String(telegramId), mint, tokenName || 'MEME', entryPrice, totalAmount, totalAmount, 'OPEN']
    );

    if (userRes.rows[0].referrer_id) {
      const refReward = platformFee * REFERRAL_SHARE_PERCENT;
      await pool.query(
        'UPDATE users SET referral_rewards_sol = COALESCE(referral_rewards_sol, 0) + $1 WHERE telegram_id = $2',
        [refReward, userRes.rows[0].referrer_id]
      );
    }

    res.json({ success: true, txHash: "buy_" + Math.random().toString(36).substring(2, 12), newBalance: newBalance.toFixed(4) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Продаж: повернення коштів на баланс з урахуванням зміни ціни
app.post('/api/trade/sell', async (req, res) => {
  const { telegramId, tradeId, percent, currentPriceSol } = req.body;
  try {
    const userRes = await pool.query('SELECT balance_sol FROM users WHERE telegram_id = $1', [String(telegramId)]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "Користувача не знайдено" });

    const tradeRes = await pool.query(
      "SELECT id, mint, entry_price_sol, amount_sol, remaining_amount_sol FROM trades WHERE id = $1 AND telegram_id = $2 AND status = 'OPEN'",
      [tradeId, String(telegramId)]
    );
    if (tradeRes.rows.length === 0) return res.status(404).json({ error: "Позицію не знайдено або закрито" });

    const currentRemaining = parseFloat(tradeRes.rows[0].remaining_amount_sol || tradeRes.rows[0].amount_sol);
    const entryPrice = parseFloat(tradeRes.rows[0].entry_price_sol || 0.000000030);
    const exitPrice = parseFloat(currentPriceSol || priceMemoryCache.get(tradeRes.rows[0].mint) || entryPrice);

    const priceRatio = exitPrice / entryPrice;
    const pct = Math.min(100, Math.max(1, parseFloat(percent || 100))) / 100;
    
    const soldPortionSol = currentRemaining * pct;
    const newRemainingSol = currentRemaining - soldPortionSol;

    const returnSol = soldPortionSol * priceRatio;
    const profitNet = returnSol - soldPortionSol;

    if (newRemainingSol <= 0.0005) {
      await pool.query("UPDATE trades SET remaining_amount_sol = 0, status = 'CLOSED' WHERE id = $1", [tradeId]);
    } else {
      await pool.query("UPDATE trades SET remaining_amount_sol = $1 WHERE id = $2", [newRemainingSol.toFixed(4), tradeId]);
    }

    const updatedBalance = parseFloat(userRes.rows[0].balance_sol) + returnSol;
    await pool.query(
      'UPDATE users SET balance_sol = $1, pnl_sol = COALESCE(pnl_sol, 0) + $2 WHERE telegram_id = $3',
      [updatedBalance.toFixed(4), profitNet.toFixed(4), String(telegramId)]
    );

    res.json({
      success: true,
      returnAmountSol: returnSol.toFixed(4),
      newBalance: updatedBalance.toFixed(4),
      remainingAmountSol: newRemainingSol <= 0.0005 ? 0 : newRemainingSol.toFixed(4)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Виведення коштів
app.post('/api/wallet/withdraw', async (req, res) => {
  const { telegramId, targetAddress, amountSol } = req.body;
  try {
    const userRes = await pool.query('SELECT balance_sol FROM users WHERE telegram_id = $1', [String(telegramId)]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "Користувача не знайдено" });

    const bal = parseFloat(userRes.rows[0].balance_sol);
    const amount = parseFloat(amountSol);

    if (amount <= 0 || amount > bal) return res.status(400).json({ error: "Некоректна сума" });

    const newBal = bal - amount;
    await pool.query('UPDATE users SET balance_sol = $1 WHERE telegram_id = $2', [newBal.toFixed(4), String(telegramId)]);

    res.json({ success: true, txHash: "with_" + Math.random().toString(36).substring(2, 10), newBalance: newBal.toFixed(4) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/whales', (req, res) => res.json(WHALE_DATABASE));
app.get('/api/radar/latest', (req, res) => res.json(latestTokens));

app.get('/api/referrals/:telegramId', async (req, res) => {
  const { telegramId } = req.params;
  try {
    const refCountRes = await pool.query('SELECT COUNT(*) FROM users WHERE referrer_id = $1', [String(telegramId)]);
    const userRes = await pool.query('SELECT referral_rewards_sol FROM users WHERE telegram_id = $1', [String(telegramId)]);
    res.json({
      referralsCount: parseInt(refCountRes.rows[0]?.count || 0, 10),
      totalEarnedSol: parseFloat(userRes.rows[0]?.referral_rewards_sol || 0).toFixed(4),
      refLink: `https://t.me/darksolradar_bot/app?startapp=ref_${telegramId}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`SELECT telegram_id, volume_sol, pnl_sol, winrate FROM users ORDER BY pnl_sol DESC NULLS LAST LIMIT 10`);
    const leaderboard = result.rows.map((row, index) => ({
      rank: index + 1,
      trader: row.telegram_id.length > 5 ? `Trader_${row.telegram_id.slice(-4)}` : `Trader_${row.telegram_id}`,
      pnl: `+${(parseFloat(row.pnl_sol) || 12.5 + (10 - index) * 2.5).toFixed(2)} SOL`,
      winrate: row.winrate || (85 - index * 2),
      volume: `${(parseFloat(row.volume_sol) || 40.0 + (10 - index) * 5.0).toFixed(1)} SOL`
    }));
    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whales/custom', async (req, res) => {
  const { address, name } = req.body;
  if (!address || address.length < 32) return res.status(400).json({ error: "Некоректна адреса" });
  const whaleItem = { id: Date.now(), name: name || `Custom (${address.slice(0, 4)}...)`, address, winrate: 78, pnl7d: "+50 SOL", isCopied: true };
  WHALE_DATABASE.push(whaleItem);
  res.json({ success: true, whale: whaleItem });
});

function listenPumpFun() {
  const ws = new WebSocket('wss://pumpportal.fun/api/data');
  ws.on('open', () => ws.send(JSON.stringify({ method: "subscribeNewToken" })));
  ws.on('message', (data) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.mint && parsed.name) {
        priceMemoryCache.set(parsed.mint, 0.000000030);
        latestTokens.unshift({
          mint: parsed.mint,
          name: parsed.name,
          symbol: parsed.symbol || "MEME",
          initialBuy: parsed.initialBuy ? (parsed.initialBuy / LAMPORTS_PER_SOL).toFixed(2) : "0.5",
          time: new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          aiScore: Math.floor(Math.random() * (98 - 82 + 1)) + 82
        });
        if (latestTokens.length > 15) latestTokens.pop();
      }
    } catch (err) {}
  });
  ws.on('error', () => setTimeout(listenPumpFun, 5000));
}
listenPumpFun();

app.listen(PORT, () => console.log(`🚀 Dark Sol Radar Exchange Engine на порту ${PORT}`));
