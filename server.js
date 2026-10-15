import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// ---------- HTTP: отдаём статику ----------
const httpServer = createServer((req, res) => {
  const url = req.url === '/' ? '/index.html' : req.url;
  try {
    const file = readFileSync(join(__dirname, 'public', url));
    const ext = url.split('.').pop();
    const type = { html: 'text/html', css: 'text/css', js: 'text/javascript' }[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': type });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

// ---------- WebSocket: комнаты ----------
const wss = new WebSocketServer({ server: httpServer });
const rooms = new Map(); // roomId -> { master: ws, players: Map<id, {ws, nick, pressMs}> }

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, { master: null, players: new Map() });
  return rooms.get(roomId);
}

wss.on('connection', (ws) => {
  ws.roomId = null;
  ws.role = null;
  ws.playerId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // --- Мастер заходит в комнату ---
    if (msg.type === 'master_join') {
      const room = getRoom(msg.room);
      room.master = ws;
      ws.roomId = msg.room;
      ws.role = 'master';
      send(ws, { type: 'master_ok' });
      broadcastPlayers(ws.roomId);
      return;
    }

    // --- Игрок заходит в комнату ---
    if (msg.type === 'player_join') {
      const room = getRoom(msg.room);
      const id = Math.random().toString(36).slice(2, 10);
      ws.roomId = msg.room;
      ws.role = 'player';
      ws.playerId = id;
      room.players.set(id, { ws, nick: msg.nick, pressMs: null });
      send(ws, { type: 'player_ok', id });
      broadcastPlayers(msg.room);
      return;
    }

    // --- Мастер нажал «Сброс / Начать раунд» ---
    if (msg.type === 'round_start' && ws.role === 'master') {
      const room = rooms.get(ws.roomId);
      if (!room) return;
      for (const p of room.players.values()) {
        p.pressMs = null;
        send(p.ws, { type: 'round_start' });
      }
      broadcastPlayers(ws.roomId);
      return;
    }

    // --- Игрок нажал кнопку ---
    if (msg.type === 'press' && ws.role === 'player') {
      const room = rooms.get(ws.roomId);
      if (!room) return;
      const p = room.players.get(ws.playerId);
      if (!p || p.pressMs != null) return;
      p.pressMs = msg.deltaMs;
      broadcastPlayers(ws.roomId);
      return;
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.roomId);
    if (!room) return;
    if (ws.role === 'master' && room.master === ws) {
      for (const p of room.players.values()) send(p.ws, { type: 'master_left' });
      rooms.delete(ws.roomId);
    } else if (ws.role === 'player') {
      room.players.delete(ws.playerId);
      broadcastPlayers(ws.roomId);
    }
  });
});

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcastPlayers(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.master) return;
  const list = [...room.players.entries()].map(([id, p]) => ({
    id, nick: p.nick, pressMs: p.pressMs
  }));
  send(room.master, { type: 'players', players: list });
}

httpServer.listen(PORT, () => {
  console.log(`FastFingers server: http://localhost:${PORT}`);
});