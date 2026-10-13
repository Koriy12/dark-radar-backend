import express from 'express';
import cors from 'cors';
import { Keypair, Connection, clusterApiUrl, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import WebSocket from 'ws';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

// ТВІЙ ГАМАНЕЦЬ ДЛЯ ЗБОРУ КОМІСІЙ (можеш замінити на свій реальний публічний ключ Solana)
const FEE_RECIPIENT_WALLET = "EiiXRmMt41GCBKdsodHHk8DLM8E32QmqQHp7Fv5pzXLs";
const FEE_PERCENT = 0.01; // 1% комісії платформи

// In-memory збереження ключів
const userWallets = new Map();

// 1. Ініціалізація/створення гаманця під Telegram ID
app.post('/api/wallet/init', (req, res) => {
    const { telegramId } = req.body;
    if (!telegramId) return res.status(400).json({ error: "telegramId is required" });

    if (!userWallets.has(telegramId)) {
        const newKeypair = Keypair.generate();
        userWallets.set(telegramId, {
            publicKey: newKeypair.publicKey.toBase58(),
            secretKey: bs58.encode(newKeypair.secretKey)
        });
    }

    const wallet = userWallets.get(telegramId);
    res.json({
        publicKey: wallet.publicKey,
        feeTier: "Standard (1% fee)",
        autoCopyEnabled: true
    });
});

// 2. Перевірка реального балансу SOL
app.get('/api/wallet/balance/:pubkey', async (req, res) => {
    try {
        const pubkey = new PublicKey(req.params.pubkey);
        const balanceLamports = await connection.getBalance(pubkey);
        res.json({ balanceSol: (balanceLamports / LAMPORTS_PER_SOL).toFixed(4) });
    } catch (e) {
        res.status(500).json({ error: e.message, balanceSol: "0.0000" });
    }
});

// 3. Список китів
app.get('/api/whales', (req, res) => {
    res.json([
        { id: 1, name: "Alpha Whale #1", address: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", winrate: 88, pnl7d: "+342 SOL", isCopied: true },
        { id: 2, name: "Sol Sniper 0x", address: "3k8gB6c7P3hQyLq9xM1k9ZfT6xW8rV2pA4bC5dE7fG8h", winrate: 79, pnl7d: "+189 SOL", isCopied: false },
        { id: 3, name: "Meme King 99", address: "9xV2pA4bC5dE7fG8h3k8gB6c7P3hQyLq9xM1k9ZfT6xW", winrate: 74, pnl7d: "+94 SOL", isCopied: false }
    ]);
});

// 4. Виконання угоди через PumpPortal API з урахуванням 1% комісії
app.post('/api/trade/pump', async (req, res) => {
    const { telegramId, mint, action, amountSol } = req.body;
    const wallet = userWallets.get(telegramId);

    if (!wallet) return res.status(404).json({ error: "Гаманець не знайдено" });

    try {
        const totalAmount = parseFloat(amountSol);
        const platformFee = totalAmount * FEE_PERCENT;
        const netTradeAmount = totalAmount - platformFee;

        const response = await fetch("https://pumpportal.fun/api/trade-local", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                publicKey: wallet.publicKey,
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

            if (FEE_RECIPIENT_WALLET !== "ENTER_YOUR_SOLANA_WALLET_ADDRESS_HERE") {
                tx.add(SystemProgram.transfer({
                    fromPubkey: new PublicKey(wallet.publicKey),
                    toPubkey: new PublicKey(FEE_RECIPIENT_WALLET),
                    lamports: Math.floor(platformFee * LAMPORTS_PER_SOL)
                }));
            }

            const signerKeypair = Keypair.fromSecretKey(bs58.decode(wallet.secretKey));
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

// 5. Підключення до онлайн-потоку нових мемкоїнів Pump.fun
function listenPumpFun() {
    const ws = new WebSocket('wss://pumpportal.fun/api/data');
    ws.on('open', () => {
        ws.send(JSON.stringify({ method: "subscribeNewToken" }));
        console.log("⚡ Підключено до PumpPortal Live Feed");
    });

    ws.on('message', (data) => {
        // Отримання свіжих токенів
    });

    ws.on('error', () => setTimeout(listenPumpFun, 5000));
}

listenPumpFun();

app.listen(PORT, () => {
    console.log(`🚀 Сервер Dark Sol Radar працює на порті ${PORT}`);
});
