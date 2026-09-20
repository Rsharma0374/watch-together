/**
 * Screening Room — backend
 * ---------------------------------------------------------------
 * Express provides a small REST API for creating/checking rooms.
 * Socket.IO handles the realtime sync (play/pause/seek/chat/seats)
 * plus WebRTC signaling for screen share and voice chat.
 *
 * Host model: the first person to join a room is the "host" — only
 * they can load/play/pause/seek the video, or start a screen share.
 * Everyone else is a view-only "guest": their player just mirrors
 * whatever the host does. If the host disconnects, host status
 * passes to the next remaining occupant.
 *
 * Up to MAX_OCCUPANTS people share a room. Screen share and voice
 * chat are both peer-to-peer mesh: the server never touches the
 * audio/video itself, it only relays SDP offers/answers and ICE
 * candidates between the two browsers that need to talk to each
 * other, addressed by socket id ("to"/"from"). For screen share
 * that means the host holds one RTCPeerConnection per guest; for
 * voice chat every pair of occupants can hold one directly (a full
 * mesh), which is fine at this room size but wouldn't scale much
 * beyond ~6-8 people without a media server (SFU).
 *
 * State lives in memory (a Map). That's intentional: this app is
 * built for a small short-lived session, not persistence across
 * server restarts. If you outgrow that, swap ROOMS for Redis
 * without changing any of the event contracts below.
 * ---------------------------------------------------------------
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3001;
const MAX_OCCUPANTS = 5;
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
 *    occupants: Map<socketId, { name, isHost, micOn }>,
 *    hostId: socketId | null,
 *    sharing: boolean, // true while the host has an active screen share
 *    video: { url, isPlaying, currentTime, updatedAt }
 *  }
 */
const ROOMS = new Map();

function isHost(room, socketId) {
  return !!room && room.hostId === socketId;
}

function hostName(room) {
  if (!room || !room.hostId) return null;
  return room.occupants.get(room.hostId)?.name || 'Guest';
}

// Occupant list as sent to clients — never includes the requesting socket
// itself, since each client already knows who it is.
function peerList(room, excludeId) {
  return [...room.occupants.entries()]
    .filter(([id]) => id !== excludeId)
    .map(([id, o]) => ({ id, name: o.name, isHost: o.isHost, micOn: o.micOn }));
}

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
    hostName: hostName(room),
    sharing: room.sharing,
    // A playing video advances while nobody sends an event. Calculate its
    // position at the instant a newcomer asks for room state so they join at
    // the live point instead of at the host's last play/seek event.
    video: {
      ...room.video,
      currentTime: room.video.isPlaying
        ? room.video.currentTime + (Date.now() - room.video.updatedAt) / 1000
        : room.video.currentTime
    }
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
    hostId: null,
    sharing: false,
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
    maxOccupants: MAX_OCCUPANTS,
    ...publicRoomState(room)
  });
});

// ---------------------------------------------------------------
// Socket.IO — realtime sync
// ---------------------------------------------------------------

io.on('connection', (socket) => {
  let currentRoom = null;

  function leaveCurrentRoom() {
    if (!currentRoom) return;
    const code = currentRoom;
    const room = ROOMS.get(code);
    currentRoom = null;
    if (!room) return;

    const departing = room.occupants.get(socket.id);
    if (!departing) return;

    // The room belongs to its creator/host. Once they leave, the session is
    // over rather than silently making another guest the host.
    if (room.hostId === socket.id) {
      ROOMS.delete(code);
      socket.to(code).emit('room:closed', {
        message: `${departing.name || 'The host'} left, so this room was closed.`
      });
      return;
    }

    room.occupants.delete(socket.id);
    touchRoom(code);
    socket.to(code).emit('room:leave', {
      occupantCount: room.occupants.size,
      hostName: hostName(room),
      id: socket.id,
      name: departing.name || 'Someone'
    });
  }

  socket.on('room:join', ({ code, name }) => {
    code = (code || '').toUpperCase();
    const room = ROOMS.get(code);

    if (!room) {
      socket.emit('room:error', { message: 'That room code doesn\'t exist.' });
      return;
    }
    if (room.occupants.size >= MAX_OCCUPANTS) {
      socket.emit('room:error', { message: `That room already has ${MAX_OCCUPANTS} people in it.` });
      return;
    }

    currentRoom = code;
    socket.join(code);

    // First occupant of a fresh room becomes host; everyone after is a guest.
    if (!room.hostId) room.hostId = socket.id;
    const amHost = isHost(room, socket.id);

    const safeName = typeof name === 'string' ? name.trim().slice(0, 32) : '';
    room.occupants.set(socket.id, { name: safeName || 'Guest', isHost: amHost, micOn: false });
    touchRoom(code);

    // Tell the newly joined client the current state, so their player
    // catches up immediately instead of starting from nothing. Also tell
    // them whether they're the host, who else is already here (so they can
    // open voice/screen-share connections to those peers), and whether a
    // screen share is already in progress (so the host side knows to send
    // this newcomer an offer for it).
    socket.emit('room:state', {
      code,
      occupantCount: room.occupants.size,
      isHost: amHost,
      hostName: hostName(room),
      sharing: room.sharing,
      peers: peerList(room, socket.id),
      video: publicRoomState(room).video
    });

    // Tell everyone else someone joined, including their socket id so
    // existing occupants can open a direct connection to them if needed
    // (e.g. the host offering an in-progress screen share, or anyone with
    // their mic already on).
    socket.to(code).emit('room:join', {
      occupantCount: room.occupants.size,
      id: socket.id,
      name: safeName || 'Guest',
      isHost: amHost
    });
  });

  socket.on('video:load', ({ url }) => {
    const room = ROOMS.get(currentRoom);
    if (!room) return;
    if (!isHost(room, socket.id)) {
      socket.emit('room:error', { message: 'Only the host can choose what plays.' });
      return;
    }
    room.video = { url, isPlaying: false, currentTime: 0, updatedAt: Date.now() };
    touchRoom(currentRoom);
    socket.to(currentRoom).emit('video:load', { url });
  });

  socket.on('video:play', ({ t }) => {
    const room = ROOMS.get(currentRoom);
    if (!room) return;
    if (!isHost(room, socket.id)) {
      socket.emit('room:error', { message: 'Only the host can control playback.' });
      return;
    }
    room.video.isPlaying = true;
    room.video.currentTime = t;
    room.video.updatedAt = Date.now();
    touchRoom(currentRoom);
    socket.to(currentRoom).emit('video:play', { t });
  });

  socket.on('video:pause', ({ t }) => {
    const room = ROOMS.get(currentRoom);
    if (!room) return;
    if (!isHost(room, socket.id)) {
      socket.emit('room:error', { message: 'Only the host can control playback.' });
      return;
    }
    room.video.isPlaying = false;
    room.video.currentTime = t;
    room.video.updatedAt = Date.now();
    touchRoom(currentRoom);
    socket.to(currentRoom).emit('video:pause', { t });
  });

  socket.on('video:seek', ({ t }) => {
    const room = ROOMS.get(currentRoom);
    if (!room) return;
    if (!isHost(room, socket.id)) {
      socket.emit('room:error', { message: 'Only the host can control playback.' });
      return;
    }
    room.video.currentTime = t;
    room.video.updatedAt = Date.now();
    touchRoom(currentRoom);
    socket.to(currentRoom).emit('video:seek', { t });
  });

  socket.on('chat:message', ({ text, id }) => {
    if (!currentRoom || typeof text !== 'string' || !text.trim()) return;
    touchRoom(currentRoom);
    const room = ROOMS.get(currentRoom);
    const name = room?.occupants.get(socket.id)?.name || 'Guest';
    socket.to(currentRoom).emit('chat:message', {
      id,
      text: text.trim(),
      name,
      from: socket.id
    });
  });

  // ---------------------------------------------------------------
  // Screen share — WebRTC signaling relay (host -> each guest, targeted)
  // ---------------------------------------------------------------
  // The server never sees the audio/video itself, only the SDP/ICE
  // handshake messages needed for each pair of browsers to open a direct
  // (or STUN-assisted) peer connection. Only the host may originate a
  // share offer; everything is targeted by socket id ("to") since with
  // more than one guest a room-wide broadcast would only let one of them
  // actually complete the handshake.

  socket.on('share:start', () => {
    const room = ROOMS.get(currentRoom);
    if (!room) return;
    if (!isHost(room, socket.id)) {
      socket.emit('room:error', { message: 'Only the host can share their screen.' });
      return;
    }
    room.sharing = true;
    touchRoom(currentRoom);
    socket.to(currentRoom).emit('share:start');
  });

  socket.on('share:stop', () => {
    const room = ROOMS.get(currentRoom);
    if (!room) return;
    if (!isHost(room, socket.id)) return;
    room.sharing = false;
    touchRoom(currentRoom);
    socket.to(currentRoom).emit('share:stop');
  });

  socket.on('webrtc:offer', ({ to, sdp }) => {
    const room = ROOMS.get(currentRoom);
    if (!room || !room.occupants.has(to)) return;
    if (!isHost(room, socket.id)) {
      socket.emit('room:error', { message: 'Only the host can start a screen share.' });
      return;
    }
    touchRoom(currentRoom);
    io.to(to).emit('webrtc:offer', { from: socket.id, sdp });
  });

  socket.on('webrtc:answer', ({ to, sdp }) => {
    const room = ROOMS.get(currentRoom);
    if (!room || !room.occupants.has(to)) return;
    touchRoom(currentRoom);
    io.to(to).emit('webrtc:answer', { from: socket.id, sdp });
  });

  socket.on('webrtc:ice-candidate', ({ to, candidate }) => {
    const room = ROOMS.get(currentRoom);
    if (!room || !room.occupants.has(to)) return;
    io.to(to).emit('webrtc:ice-candidate', { from: socket.id, candidate });
  });

  // ---------------------------------------------------------------
  // Voice chat — WebRTC signaling relay (full mesh, targeted)
  // ---------------------------------------------------------------
  // Anyone may originate a voice offer to anyone else in the same room —
  // unlike screen share this isn't host-gated, since talking is symmetric.

  socket.on('voice:offer', ({ to, sdp }) => {
    const room = ROOMS.get(currentRoom);
    if (!room || !room.occupants.has(to)) return;
    touchRoom(currentRoom);
    io.to(to).emit('voice:offer', { from: socket.id, sdp });
  });

  socket.on('voice:answer', ({ to, sdp }) => {
    const room = ROOMS.get(currentRoom);
    if (!room || !room.occupants.has(to)) return;
    touchRoom(currentRoom);
    io.to(to).emit('voice:answer', { from: socket.id, sdp });
  });

  socket.on('voice:ice-candidate', ({ to, candidate }) => {
    const room = ROOMS.get(currentRoom);
    if (!room || !room.occupants.has(to)) return;
    io.to(to).emit('voice:ice-candidate', { from: socket.id, candidate });
  });

  socket.on('voice:mic-state', ({ on }) => {
    const room = ROOMS.get(currentRoom);
    if (!room) return;
    const occupant = room.occupants.get(socket.id);
    if (occupant) occupant.micOn = !!on;
    touchRoom(currentRoom);
    socket.to(currentRoom).emit('voice:mic-state', { id: socket.id, on: !!on });
  });

  socket.on('room:leave', () => {
    leaveCurrentRoom();
    socket.leaveAll();
  });

  socket.on('disconnect', () => {
    leaveCurrentRoom();
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
