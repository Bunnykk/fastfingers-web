let ws = null;
let isMaster = false;
let roundStart = 0;
let buttonEnabled = false;

const $ = (id) => document.getElementById(id);

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function backToMenu() {
  if (ws) { ws.close(); ws = null; }
  buttonEnabled = false;
  $('bigButton').disabled = true;
  $('bigButton').textContent = 'Ожидание';
  $('playerStatus').textContent = 'Введите ник и подключитесь';
  show('menu');
}

function showMaster() {
  isMaster = true;
  show('master');
}

function showPlayer() {
  isMaster = false;
  show('player');
}

function ensureWs(onOpen) {
  if (ws && ws.readyState === 1) { onOpen(); return; }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => onOpen();
  ws.onmessage = handleMessage;
  ws.onclose = () => {
    if (isMaster) $('masterStatus').textContent = 'Соединение потеряно';
    else $('playerStatus').textContent = 'Соединение потеряно';
  };
}

// -------- Мастер --------
function masterConnect() {
  ensureWs(() => {
    ws.send(JSON.stringify({ type: 'master_join', room: $('roomCode').value }));
  });
}

function masterReset() {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'round_start' }));
  }
}

// -------- Игрок --------
function playerConnect() {
  const nick = $('nick').value.trim();
  if (!nick) { $('playerStatus').textContent = 'Введите ник'; return; }
  ensureWs(() => {
    ws.send(JSON.stringify({
      type: 'player_join', room: $('playerRoom').value, nick
    }));
  });
}

function playerPress() {
  if (!buttonEnabled) return;
  const delta = Date.now() - roundStart;
  buttonEnabled = false;
  $('bigButton').disabled = true;
  $('bigButton').textContent = 'Ожидание';
  $('playerStatus').textContent = `Нажато за ${(delta / 1000).toFixed(2)} с`;
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'press', deltaMs: delta }));
  }
}

// -------- Приём сообщений --------
function handleMessage(ev) {
  const msg = JSON.parse(ev.data);

  if (msg.type === 'master_ok') {
    $('masterStatus').textContent = 'Сервер запущен. Ждём игроков.';
    $('resetBtn').disabled = false;
    return;
  }

  if (msg.type === 'player_ok') {
    $('playerStatus').textContent = 'Подключено. Ждём старта раунда.';
    return;
  }

  if (msg.type === 'players' && isMaster) {
    renderPlayers(msg.players);
    return;
  }

  if (msg.type === 'round_start' && !isMaster) {
    roundStart = Date.now();
    buttonEnabled = true;
    $('bigButton').disabled = false;
    $('bigButton').textContent = 'ЖМИ!';
    $('playerStatus').textContent = 'ЖМИ!';
    return;
  }

  if (msg.type === 'master_left' && !isMaster) {
    alert('Мастер вышел');
    backToMenu();
    return;
  }
}

function renderPlayers(players) {
  const sorted = [...players].sort((a, b) => {
    if (a.pressMs == null && b.pressMs == null) return 0;
    if (a.pressMs == null) return 1;
    if (b.pressMs == null) return -1;
    return a.pressMs - b.pressMs;
  });
  $('playerList').innerHTML = sorted.map(p => `
    <div class="player-row">
      <span>${escapeHtml(p.nick)}</span>
      <span>${p.pressMs == null ? '—' : (p.pressMs / 1000).toFixed(2) + ' с'}</span>
    </div>
  `).join('');
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// авто-подключение мастера при заходе на экран
const origShowMaster = showMaster;
showMaster = function() {
  origShowMaster();
  setTimeout(masterConnect, 100);
};