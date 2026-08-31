/**
 * Screening Room — backend
 * ---------------------------------------------------------------
 * Express provides a small REST API for creating/checking rooms.
 * Socket.IO handles the realtime sync (play/pause/seek/chat/seats).
 *
 * State lives in memory (a Map). That's intentional: this app is
 * built for 2 people in a short-lived session, not persistence
 * across server restarts. If you outgrow that, swap ROOMS for
 * Redis without changing any of the event contracts below.
 * ---------------------------------------------------------------
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3001;
const MAX_OCCUPANTS = 2;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // rooms auto-expire after 6h of no activity

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

/** roomCode -> {
 *    createdAt, lastActivity,
 *    occupants: Map<socketId, { name }>,
 *    video: { url, isPlaying, currentTime, updatedAt }
 *  }
 */
const ROOMS = new Map();

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
  let out = '';
  do {
    out = '';
    for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  } while (ROOMS.has(out));
  return out;
}

function touchRoom(code) {
  const room = ROOMS.get(code);
  if (room) room.lastActivity = Date.now();
}

function publicRoomState(room) {
  return {
    occupantCount: room.occupants.size,
    video: room.video
  };
}

// ---------------------------------------------------------------
// REST API
// ---------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rooms: ROOMS.size, uptime: process.uptime() });
});

// Create a new room, get back its code.
app.post('/api/rooms', (_req, res) => {
  const code = genCode();
  ROOMS.set(code, {
    createdAt: Date.now(),
    lastActivity: Date.now(),
    occupants: new Map(),
    video: { url: null, isPlaying: false, currentTime: 0, updatedAt: Date.now() }
  });
  res.status(201).json({ code });
});

// Check whether a room exists / has space, before a client tries to join it.
app.get('/api/rooms/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const room = ROOMS.get(code);
  if (!room) return res.status(404).json({ exists: false });
  res.json({
    exists: true,
    full: room.occupants.size >= MAX_OCCUPANTS,
    ...publicRoomState(room)
  });
});

// ---------------------------------------------------------------
// Socket.IO — realtime sync
// ---------------------------------------------------------------

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('room:join', ({ code, name }) => {
    code = (code || '').toUpperCase();
    const room = ROOMS.get(code);

    if (!room) {
      socket.emit('room:error', { message: 'That room code doesn\'t exist.' });
      return;
    }
    if (room.occupants.size >= MAX_OCCUPANTS) {
      socket.emit('room:error', { message: 'That room already has two people in it.' });
      return;
    }

    currentRoom = code;
    socket.join(code);
    room.occupants.set(socket.id, { name: name || 'Guest' });
    touchRoom(code);

    // Tell the newly joined client the current state, so their player
    // catches up immediately instead of starting from nothing.
    socket.emit('room:state', {
      code,
      occupantCount: room.occupants.size,
      video: room.video
    });

    // Tell everyone else someone joined.
    socket.to(code).emit('room:join', {
      occupantCount: room.occupants.size,
      name: name || 'Guest'
    });
  });

  socket.on('video:load', ({ url }) => {
    const room = ROOMS.get(currentRoom);
    if (!room) return;
    room.video = { url, isPlaying: false, currentTime: 0, updatedAt: Date.now() };
    touchRoom(currentRoom);
    socket.to(currentRoom).emit('video:load', { url });
  });

  socket.on('video:play', ({ t }) => {
    const room = ROOMS.get(currentRoom);
    if (!room) return;
    room.video.isPlaying = true;
    room.video.currentTime = t;
    room.video.updatedAt = Date.now();
    touchRoom(currentRoom);
    socket.to(currentRoom).emit('video:play', { t });
  });

  socket.on('video:pause', ({ t }) => {
    const room = ROOMS.get(currentRoom);
    if (!room) return;
    room.video.isPlaying = false;
    room.video.currentTime = t;
    room.video.updatedAt = Date.now();
    touchRoom(currentRoom);
    socket.to(currentRoom).emit('video:pause', { t });
  });

  socket.on('video:seek', ({ t }) => {
    const room = ROOMS.get(currentRoom);
    if (!room) return;
    room.video.currentTime = t;
    room.video.updatedAt = Date.now();
    touchRoom(currentRoom);
    socket.to(currentRoom).emit('video:seek', { t });
  });

  socket.on('chat:message', ({ text }) => {
    if (!currentRoom || !text) return;
    touchRoom(currentRoom);
    const room = ROOMS.get(currentRoom);
    const name = room?.occupants.get(socket.id)?.name || 'Guest';
    socket.to(currentRoom).emit('chat:message', { text, name });
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = ROOMS.get(currentRoom);
    if (!room) return;
    room.occupants.delete(socket.id);
    touchRoom(currentRoom);
    socket.to(currentRoom).emit('room:leave', { occupantCount: room.occupants.size });

    // Clean up empty rooms right away rather than waiting for the sweep.
    if (room.occupants.size === 0) {
      ROOMS.delete(currentRoom);
    }
  });
});

// Sweep stale rooms periodically so memory doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of ROOMS.entries()) {
    if (now - room.lastActivity > ROOM_TTL_MS) ROOMS.delete(code);
  }
}, 30 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`Screening Room backend listening on :${PORT}`);
});
