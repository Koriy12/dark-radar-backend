<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Dark Sol Radar</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    body {
      background-color: #0b0e14;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-tap-highlight-color: transparent;
    }
    .dark-card {
      background: #111827;
      border: 1px solid #1f2937;
    }
    .glow-green {
      box-shadow: 0 0 15px rgba(16, 185, 129, 0.2);
    }
    .no-scrollbar::-webkit-scrollbar {
      display: none;
    }
  </style>
</head>
<body class="flex flex-col min-h-screen pb-20 select-none">

  <!-- Хедер -->
  <header class="p-4 flex items-center justify-between border-b border-gray-800 bg-[#0e131f]/80 backdrop-blur sticky top-0 z-40">
    <div class="flex items-center space-x-3">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 flex items-center justify-center font-black text-black text-xl shadow-lg shadow-emerald-500/20">
        ⚡
      </div>
      <div>
        <h1 class="text-sm font-bold tracking-wide flex items-center gap-1.5">
          DARK RADAR <span class="bg-emerald-500/10 text-emerald-400 text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/20 font-mono">SOL LIVE</span>
        </h1>
        <div class="flex items-center gap-1 text-[11px] text-gray-400">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>RPC Online • 1% Fee</span>
        </div>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <button onclick="toggleModal('deposit-modal')" class="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1">
        <i class="fa-solid fa-plus text-[10px]"></i> Депозит
      </button>
      <button onclick="toggleModal('withdraw-modal')" class="bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 text-xs px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1">
        <i class="fa-solid fa-arrow-up-from-bracket text-[10px]"></i> Вивести
      </button>
    </div>
  </header>

  <!-- Баланс та Статус бота -->
  <section class="p-4">
    <div class="dark-card rounded-2xl p-4 glow-green">
      <div class="flex justify-between items-start mb-2">
        <span class="text-xs text-gray-400 uppercase tracking-wider font-semibold">Баланс субгаманця</span>
        <div class="flex items-center gap-2">
          <span class="text-xs text-gray-400">Авто-копіювання:</span>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" id="auto-copy-toggle" checked class="sr-only peer" onchange="toggleAutoCopy(this)">
            <div class="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </div>
      </div>
      <div class="flex items-baseline gap-2">
        <span id="user-balance" class="text-3xl font-extrabold text-white font-mono tracking-tight">0.0000</span>
        <span class="text-sm font-bold text-emerald-400 font-mono">SOL</span>
      </div>
      <div class="mt-3 pt-3 border-t border-gray-800/80 flex justify-between items-center text-xs text-gray-400">
        <span class="truncate max-w-[200px]" id="display-wallet">Гаманець генерується...</span>
        <button onclick="refreshBalance()" class="text-gray-400 hover:text-white transition flex items-center gap-1 text-[11px]">
          <i class="fa-solid fa-rotate-right"></i> Оновити
        </button>
      </div>
    </div>
  </section>

  <!-- Вкладки навігації (горизонтальний скрол) -->
  <div class="px-4 flex gap-2 border-b border-gray-800 overflow-x-auto no-scrollbar">
    <button onclick="switchTab('whales')" id="tab-btn-whales" class="pb-2.5 px-3 text-xs font-bold text-emerald-400 border-b-2 border-emerald-400 transition flex items-center gap-1.5 whitespace-nowrap">
      <i class="fa-solid fa-users"></i> Топ-Кити
    </button>
    <button onclick="switchTab('radar')" id="tab-btn-radar" class="pb-2.5 px-3 text-xs font-bold text-gray-400 hover:text-gray-200 transition flex items-center gap-1.5 whitespace-nowrap">
      <i class="fa-solid fa-satellite-dish"></i> AI Радар
    </button>
    <button onclick="switchTab('leaderboard')" id="tab-btn-leaderboard" class="pb-2.5 px-3 text-xs font-bold text-gray-400 hover:text-gray-200 transition flex items-center gap-1.5 whitespace-nowrap">
      <i class="fa-solid fa-trophy"></i> Лідерборд
    </button>
    <button onclick="switchTab('referrals')" id="tab-btn-referrals" class="pb-2.5 px-3 text-xs font-bold text-gray-400 hover:text-gray-200 transition flex items-center gap-1.5 whitespace-nowrap">
      <i class="fa-solid fa-handshake"></i> Партнери
    </button>
    <button onclick="switchTab('portfolio')" id="tab-btn-portfolio" class="pb-2.5 px-3 text-xs font-bold text-gray-400 hover:text-gray-200 transition flex items-center gap-1.5 whitespace-nowrap">
      <i class="fa-solid fa-chart-pie"></i> Портфель
    </button>
  </div>

  <!-- Контент вкладок -->
  <main class="flex-1 p-4 overflow-y-auto">
    <!-- Вкладка 1: Топ-Кити -->
    <div id="tab-whales" class="space-y-3">
      <div class="flex justify-between items-center mb-1">
        <span class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Активні кити для копіювання</span>
        <span class="text-[11px] text-emerald-400 font-mono">5/5 ончейн</span>
      </div>
      <div id="whales-list" class="space-y-2.5">
        <div class="text-center py-8 text-gray-500 text-xs">Завантаження ончейн-китів...</div>
      </div>
    </div>

    <!-- Вкладка 2: AI Радар -->
    <div id="tab-radar" class="hidden space-y-3">
      <div class="flex justify-between items-center mb-1">
        <span class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Нові пули (Pump.fun Stream)</span>
        <span class="text-[11px] text-cyan-400 font-mono animate-pulse">● LIVE STREAM</span>
      </div>
      <div id="radar-token-list" class="space-y-2.5">
        <div class="text-center py-8 text-gray-500 text-xs">Очікування нових пулів Pump.fun...</div>
      </div>
    </div>

    <!-- Вкладка 3: Лідерборд -->
    <div id="tab-leaderboard" class="hidden space-y-3">
      <div class="flex justify-between items-center mb-1">
        <span class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Топ трейдерів тижня</span>
        <span class="text-[11px] text-yellow-400 font-mono"><i class="fa-solid fa-medal"></i> Ончейн ранг</span>
      </div>
      <div id="leaderboard-list" class="space-y-2.5">
        <div class="text-center py-8 text-gray-500 text-xs">Завантаження лідерборду...</div>
      </div>
    </div>

    <!-- Вкладка 4: Партнери (Рефералка) -->
    <div id="tab-referrals" class="hidden space-y-4">
      <div class="dark-card rounded-2xl p-4 border-l-4 border-emerald-500">
        <div class="flex items-center gap-2 mb-2 text-emerald-400 font-bold text-sm">
          <i class="fa-solid fa-users-gear text-base"></i>
          <span>Dark Syndicate • 25% Рефбек</span>
        </div>
        <p class="text-xs text-gray-400 leading-relaxed">
          Запрошуйте трейдерів за персональним лінком та отримуйте <b class="text-emerald-400">25% від комісії</b> платформи з кожного їхнього авто-снайпінгу у SOL.
        </p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div class="dark-card rounded-xl p-3 text-center">
          <div class="text-[11px] text-gray-400 mb-1">Запрошено друзів</div>
          <div id="ref-count" class="text-xl font-bold font-mono text-white">0</div>
        </div>
        <div class="dark-card rounded-xl p-3 text-center">
          <div class="text-[11px] text-gray-400 mb-1">Зароблено SOL</div>
          <div id="ref-earned" class="text-xl font-bold font-mono text-emerald-400">0.0000</div>
        </div>
      </div>

      <div class="dark-card rounded-xl p-3">
        <span class="text-[11px] text-gray-400 block mb-1.5 font-medium">Ваше реферальне посилання:</span>
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-2.5 flex items-center justify-between">
          <span id="ref-link-text" class="font-mono text-xs text-emerald-300 truncate mr-2 select-all">Генерація лінка...</span>
          <button onclick="copyRefLink()" class="text-xs text-emerald-400 hover:text-emerald-300 font-bold shrink-0 flex items-center gap-1">
            <i class="fa-regular fa-copy"></i> Копіювати
          </button>
        </div>
      </div>
    </div>

    <!-- Вкладка 5: Портфель -->
    <div id="tab-portfolio" class="hidden space-y-3">
      <div class="dark-card rounded-xl p-4 text-center">
        <div class="text-xs text-gray-400 mb-1">Відкриті авто-угоди</div>
        <div id="open-trades-count" class="text-2xl font-bold font-mono text-emerald-400">0</div>
        <div class="text-[11px] text-gray-500 mt-2">Ордери формуються автоматично при сигналах від обраних китів.</div>
      </div>
    </div>
  </main>

  <!-- Модалка депозиту -->
  <div id="deposit-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
    <div class="dark-card rounded-2xl max-w-sm w-full p-5 relative border border-gray-700">
      <button onclick="toggleModal('deposit-modal')" class="absolute top-4 right-4 text-gray-400 hover:text-white">
        <i class="fa-solid fa-xmark text-lg"></i>
      </button>
      <div class="flex items-center gap-2 mb-3 text-emerald-400">
        <i class="fa-solid fa-qrcode text-lg"></i>
        <h3 class="font-bold text-sm text-white">Депозит на робота</h3>
      </div>
      <p class="text-xs text-gray-400 mb-4 leading-relaxed">
        Надішліть SOL на свій торговий субрахунок для початку авто-копіювання угод:
      </p>
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center justify-between mb-3">
        <span id="deposit-address" class="font-mono text-xs text-emerald-300 truncate mr-2 select-all">Генерація...</span>
        <button onclick="copyDepositAddress()" class="text-xs text-emerald-400 hover:text-emerald-300 font-bold shrink-0 flex items-center gap-1">
          <i class="fa-regular fa-copy"></i> Скопіювати
        </button>
      </div>
      <p class="text-[11px] text-gray-500">
        Мінімальний депозит: 0.1 SOL. Кошти доступні до виведення в будь-який момент.
      </p>
    </div>
  </div>

  <!-- Модалка виведення (Withdraw) -->
  <div id="withdraw-modal" class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
    <div class="dark-card rounded-2xl max-w-sm w-full p-5 relative border border-gray-700">
      <button onclick="toggleModal('withdraw-modal')" class="absolute top-4 right-4 text-gray-400 hover:text-white">
        <i class="fa-solid fa-xmark text-lg"></i>
      </button>
      <div class="flex items-center gap-2 mb-3 text-cyan-400">
        <i class="fa-solid fa-arrow-up-from-bracket text-lg"></i>
        <h3 class="font-bold text-sm text-white">Виведення коштів</h3>
      </div>
      <p class="text-xs text-gray-400 mb-4 leading-relaxed">
        Виведіть залишок SOL зі свого торгового бота на свій особистий Phantom-гаманець:
      </p>
      <div class="space-y-3 mb-4">
        <div>
          <label class="text-[11px] text-gray-400 block mb-1">Адреса гаманця Solana (Phantom)</label>
          <input type="text" id="withdraw-target" placeholder="Введіть адресу гаманця..." class="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500">
        </div>
        <div>
          <label class="text-[11px] text-gray-400 block mb-1">Сума (SOL)</label>
          <input type="number" step="0.01" id="withdraw-amount" placeholder="0.1" class="w-full bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500">
        </div>
      </div>
      <button onclick="submitWithdraw()" class="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs py-2.5 rounded-xl transition shadow-md shadow-cyan-500/20">
        Підтвердити виведення
      </button>
    </div>
  </div>

  <!-- Тост сповіщень -->
  <div id="toast" class="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 border border-emerald-500/40 text-emerald-300 px-4 py-2 rounded-xl text-xs shadow-2xl transition-opacity duration-300 opacity-0 pointer-events-none z-50 font-mono">
    Повідомлення
  </div>

  <script>
    const API_BASE_URL = 'https://dark-radar-api.onrender.com';
    let currentPublicKey = '';
    let currentTelegramId = 'demo_user_123';

    function showToast(msg) {
      const toast = document.getElementById('toast');
      toast.innerText = msg;
      toast.classList.remove('opacity-0');
      setTimeout(() => toast.classList.add('opacity-0'), 3000);
    }

    function toggleModal(id) {
      const modal = document.getElementById(id);
      modal.classList.toggle('hidden');
    }

    function copyDepositAddress() {
      const addr = document.getElementById('deposit-address').innerText;
      if (addr && !addr.includes('...')) {
        navigator.clipboard.writeText(addr);
        showToast('Адресу скопійовано в буфер!');
      }
    }

    function copyRefLink() {
      const link = document.getElementById('ref-link-text').innerText;
      if (link && !link.includes('...')) {
        navigator.clipboard.writeText(link);
        showToast('Реф-посилання скопійовано!');
      }
    }

    function switchTab(tab) {
      ['whales', 'radar', 'leaderboard', 'referrals', 'portfolio'].forEach(t => {
        const el = document.getElementById(`tab-${t}`);
        if (el) el.classList.add('hidden');
        const btn = document.getElementById(`tab-btn-${t}`);
        if (btn) btn.className = "pb-2.5 px-3 text-xs font-bold text-gray-400 hover:text-gray-200 transition flex items-center gap-1.5 whitespace-nowrap";
      });
      
      const activeTab = document.getElementById(`tab-${tab}`);
      if (activeTab) activeTab.classList.remove('hidden');
      const activeBtn = document.getElementById(`tab-btn-${tab}`);
      if (activeBtn) activeBtn.className = "pb-2.5 px-3 text-xs font-bold text-emerald-400 border-b-2 border-emerald-400 transition flex items-center gap-1.5 whitespace-nowrap";

      if (tab === 'radar') loadRadarTokens();
      if (tab === 'leaderboard') loadLeaderboard();
      if (tab === 'referrals') loadReferrals();
    }

    function refreshBalance() {
      if (!currentPublicKey) return;
      fetch(`${API_BASE_URL}/api/wallet/balance/${currentPublicKey}`)
        .then(r => r.json())
        .then(bal => {
          if (bal.balanceSol !== undefined) {
            document.getElementById('user-balance').innerText = bal.balanceSol;
            showToast('Баланс синхронізовано');
          }
        })
        .catch(() => showToast('Помилка оновлення балансу'));
    }

    function loadWhales() {
      fetch(`${API_BASE_URL}/api/whales`)
        .then(r => r.json())
        .then(whales => {
          const list = document.getElementById('whales-list');
          list.innerHTML = '';
          whales.forEach(w => {
            const card = document.createElement('div');
            card.className = "dark-card rounded-xl p-3 flex items-center justify-between";
            card.innerHTML = `
              <div>
                <div class="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>${w.name}</span>
                  <span class="text-[10px] bg-emerald-500/10 text-emerald-400 px-1 py-0.2 rounded font-mono">${w.winrate}% WR</span>
                </div>
                <div class="text-[11px] text-gray-400 font-mono mt-0.5">
                  PnL 7d: <span class="text-emerald-400 font-bold">${w.pnl7d}</span> • ${w.address.slice(0, 4)}...${w.address.slice(-4)}
                </div>
              </div>
              <button onclick="toggleFollowWhale(this, '${w.name}')" class="${w.isCopied ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300' : 'bg-gray-800 border border-gray-700 text-gray-300'} text-xs font-semibold px-3 py-1.5 rounded-lg transition">
                ${w.isCopied ? 'Копіюється' : 'Копіювати'}
              </button>
            `;
            list.appendChild(card);
          });
        })
        .catch(() => {
          document.getElementById('whales-list').innerHTML = '<div class="text-center py-4 text-xs text-red-400">Не вдалося завантажити китів</div>';
        });
    }

    function toggleFollowWhale(btn, name) {
      if (btn.innerText.trim() === 'Копіюється') {
        btn.innerText = 'Копіювати';
        btn.className = "bg-gray-800 border border-gray-700 text-gray-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition";
        showToast(`Відключено копіювання ${name}`);
      } else {
        btn.innerText = 'Копіюється';
        btn.className = "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition";
        showToast(`Підключено копіювання ${name}`);
      }
    }

    function toggleAutoCopy(toggle) {
      showToast(toggle.checked ? 'Авто-копіювання увімкнено' : 'Авто-копіювання призупинено');
    }

    function loadRadarTokens() {
      fetch(`${API_BASE_URL}/api/radar/latest`)
        .then(r => r.json())
        .then(tokens => {
          if (!tokens || tokens.length === 0) return;
          const container = document.getElementById('radar-token-list');
          container.innerHTML = '';
          tokens.forEach(t => {
            const card = document.createElement('div');
            card.className = "dark-card rounded-xl p-3 flex items-center justify-between border-l-2 border-emerald-500";
            card.innerHTML = `
              <div class="pr-2 truncate">
                <div class="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                  <span class="truncate max-w-[120px]">${t.name}</span>
                  <span class="text-[10px] text-gray-400 font-mono">($${t.symbol})</span>
                  <span class="text-[10px] bg-emerald-500/10 text-emerald-400 px-1 py-0.2 rounded font-mono shrink-0">AI ${t.aiScore}%</span>
                </div>
                <div class="text-[11px] text-gray-400 font-mono mt-0.5">
                  Час: ${t.time} • Mint: ${t.mint.slice(0, 4)}...${t.mint.slice(-4)}
                </div>
              </div>
              <button onclick="executeQuickBuy('${t.mint}', '${t.name.replace(/'/g, "")}')" class="shrink-0 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-2.5 py-1.5 rounded-lg transition shadow-md shadow-emerald-500/20">
                0.1 SOL
              </button>
            `;
            container.appendChild(card);
          });
        })
        .catch(() => {});
    }

    function loadLeaderboard() {
      fetch(`${API_BASE_URL}/api/leaderboard`)
        .then(r => r.json())
        .then(list => {
          const container = document.getElementById('leaderboard-list');
          container.innerHTML = '';
          list.forEach(item => {
            const medal = item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : `#${item.rank}`;
            const card = document.createElement('div');
            card.className = "dark-card rounded-xl p-3 flex items-center justify-between";
            card.innerHTML = `
              <div class="flex items-center gap-3">
                <span class="font-bold text-sm w-6 text-center">${medal}</span>
                <div>
                  <div class="text-xs font-bold text-white">${item.trader}</div>
                  <div class="text-[11px] text-gray-400 font-mono">WR: ${item.winrate}% • Обсяг: ${item.volume}</div>
                </div>
              </div>
              <div class="text-right">
                <div class="text-xs font-bold text-emerald-400 font-mono">${item.pnl}</div>
                <div class="text-[10px] text-gray-500 font-mono">PnL Total</div>
              </div>
            `;
            container.appendChild(card);
          });
        })
        .catch(() => {});
    }

    function loadReferrals() {
      fetch(`${API_BASE_URL}/api/referrals/${currentTelegramId}`)
        .then(r => r.json())
        .then(data => {
          if (data.referralsCount !== undefined) {
            document.getElementById('ref-count').innerText = data.referralsCount;
            document.getElementById('ref-earned').innerText = data.totalEarnedSol;
            document.getElementById('ref-link-text').innerText = data.refLink;
          }
        })
        .catch(() => {});
    }

    function executeQuickBuy(mintAddress, tokenName) {
      const balanceElem = document.getElementById('user-balance');
      const currentBal = parseFloat(balanceElem ? balanceElem.innerText : '0');

      if (currentBal < 0.1) {
        showToast('Недостатньо коштів! Поповніть депозит.');
        toggleModal('deposit-modal');
        return;
      }

      showToast(`Снайпінг ${tokenName || 'токена'}... Відправка ордера`);

      fetch(`${API_BASE_URL}/api/trade/pump`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId: String(currentTelegramId),
          mint: mintAddress,
          action: "buy",
          amountSol: 0.1
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          showToast(`Успішно куплено! TX: ${data.txHash.slice(0, 8)}...`);
          const countElem = document.getElementById('open-trades-count');
          if (countElem) countElem.innerText = parseInt(countElem.innerText || '0') + 1;
        } else {
          showToast(`Помилка: ${data.error || 'Ордер відхилено'}`);
        }
      })
      .catch(() => showToast('Помилка сервера при купівлі'));
    }

    function submitWithdraw() {
      const target = document.getElementById('withdraw-target').value.trim();
      const amount = parseFloat(document.getElementById('withdraw-amount').value);
      const balance = parseFloat(document.getElementById('user-balance').innerText || '0');

      if (!target || target.length < 32) {
        showToast('Введіть коректну адресу Solana');
        return;
      }
      if (!amount || amount <= 0 || amount > balance) {
        showToast('Некоректна сума або недостатньо балансу');
        return;
      }

      showToast('Обробка виведення...');

      fetch(`${API_BASE_URL}/api/wallet/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId: String(currentTelegramId),
          targetAddress: target,
          amountSol: amount
        })
      })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          showToast(`Виведено! TX: ${data.txHash.slice(0, 8)}...`);
          toggleModal('withdraw-modal');
          refreshBalance();
        } else {
          showToast(`Помилка: ${data.error || 'Не вдалося вивести'}`);
        }
      })
      .catch(() => showToast('Помилка з\'єднання при виведенні'));
    }

    // Запуск та ініціалізація
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();

      const tgUser = window.Telegram.WebApp.initDataUnsafe?.user;
      if (tgUser && tgUser.id) {
        currentTelegramId = tgUser.id;
      }

      // Зчитуємо реферальний параметр зі start_param Telegram
      const startParam = window.Telegram.WebApp.initDataUnsafe?.start_param || '';
      const refId = startParam.startsWith('ref_') ? startParam.replace('ref_', '') : null;

      fetch(`${API_BASE_URL}/api/wallet/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          telegramId: String(currentTelegramId),
          referrerId: refId 
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.publicKey) {
          currentPublicKey = data.publicKey;
          document.getElementById('deposit-address').innerText = data.publicKey;
          document.getElementById('display-wallet').innerText = `${data.publicKey.slice(0, 6)}...${data.publicKey.slice(-6)}`;
          
          fetch(`${API_BASE_URL}/api/wallet/balance/${data.publicKey}`)
            .then(r => r.json())
            .then(bal => {
              if (bal.balanceSol !== undefined) {
                document.getElementById('user-balance').innerText = bal.balanceSol;
              }
            });
        }
      })
      .catch(err => console.log('Offline/Init error', err));

      loadWhales();
      loadRadarTokens();
      setInterval(loadRadarTokens, 3000);
    }
  </script>
</body>
</html>
