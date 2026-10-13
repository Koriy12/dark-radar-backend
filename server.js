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

// Твій кошелек для сбору 1% комісії
const FEE_RECIPIENT_WALLET = "EiiXRmMt41GCBKdsodHHk8DLM8E32QmqQHp7Fv5pzXLs";
const FEE_PERCENT = 0.01;

// Підключення до бази PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Ініціалізація структури бази даних (створюється автоматично)
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
    console.log("✅ База даних Postgres успішно підключена та ініціалізована");
  } catch (err) {
    console.error("❌ Помилка ініціалізації БД:", err.message);
  }
}
initDB();

// 1. Отримання або генерація постійного гаманця під Telegram ID
app.post('/api/wallet/init', async (req, res) => {
  const { telegramId } = req.body;
  if (!telegramId) return res.status(400).json({ error: "telegramId is required" });

  try {
    const existing = await pool.query('SELECT public_key FROM users WHERE telegram_id = $1', [String(telegramId)]);
    if (existing.rows.length > 0) {
      return res.json({
        publicKey: existing.rows[0].public_key,
        feeTier: "Standard (1% fee)",
        autoCopyEnabled: true
      });
    }

    // Генерація нового гаманця, якщо юзер вперше в боті
    const newKeypair = Keypair.generate();
    const pubkey = newKeypair.publicKey.toBase58();
    const secret = bs58.encode(newKeypair.secretKey);

    await pool.query(
      'INSERT INTO users (telegram_id, public_key, secret_key) VALUES ($1, $2, $3)',
      [String(telegramId), pubkey, secret]
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

// 2. Перевірка балансу SOL у блокчейні Solana
app.get('/api/wallet/balance/:pubkey', async (req, res) => {
  try {
    const pubkey = new PublicKey(req.params.pubkey);
    const balanceLamports = await connection.getBalance(pubkey);
    res.json({ balanceSol: (balanceLamports / LAMPORTS_PER_SOL).toFixed(4) });
  } catch (e) {
    res.status(500).json({ error: e.message, balanceSol: "0.0000" });
  }
});

// 3. Виведення коштів (Withdraw) назад на Phantom користувача
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

// 4. Список топ-китів для копіювання
app.get('/api/whales', (req, res) => {
  res.json([
    { id: 1, name: "Alpha Whale #1", address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", winrate: 88, pnl7d: "+342 SOL", isCopied: true },
    { id: 2, name: "Sol Sniper 0x", address: "3k8gB6c7P3hQyLq9xM1k9ZfT6xW8rV2pA4bC5dE7fG8h", winrate: 79, pnl7d: "+189 SOL", isCopied: false },
    { id: 3, name: "Meme King 99", address: "9xV2pA4bC5dE7fG8h3k8gB6c7P3hQyLq9xM1k9ZfT6xW", winrate: 74, pnl7d: "+94 SOL", isCopied: false }
  ]);
});

// 5. Виконання ордера на Pump.fun через PumpPortal з відрахуванням 1% комісії
app.post('/api/trade/pump', async (req, res) => {
  const { telegramId, mint, action, amountSol } = req.body;
  try {
    const userRes = await pool.query('SELECT secret_key, public_key FROM users WHERE telegram_id = $1', [String(telegramId)]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "Гаманець не знайдено" });

    const wallet = userRes.rows[0];
    const totalAmount = parseFloat(amountSol);
    const platformFee = totalAmount * FEE_PERCENT;
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
        slippage: 10,
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
      res.json({ success: true, txHash, netTradeAmount, platformFee });
    } else {
      const err = await response.text();
      res.status(400).json({ error: err });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Стрім нових токенів Pump.fun через WebSocket
function listenPumpFun() {
  const ws = new WebSocket('wss://pumpportal.fun/api/data');
  ws.on('open', () => {
    ws.send(JSON.stringify({ method: "subscribeNewToken" }));
    console.log("⚡ Підключено до PumpPortal Live Feed");
  });
  ws.on('message', (data) => {});
  ws.on('error', () => setTimeout(listenPumpFun, 5000));
}
listenPumpFun();

app.listen(PORT, () => {
  console.log(`🚀 Сервер Dark Sol Radar працює на порту ${PORT}`);
});
