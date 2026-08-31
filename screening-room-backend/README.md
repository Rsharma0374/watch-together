# Screening Room — Backend

A real-time synchronization server for the Screening Room watch-together app. Built with **Express.js** and **Socket.IO** to enable seamless video playback sync and instant messaging between two people in a shared room.

## Features

- ✅ Create and join ephemeral rooms (6-character code)
- ✅ Real-time video sync (play/pause/seek) for both YouTube and direct video links
- ✅ Live chat between room occupants
- ✅ Automatic room cleanup after 6 hours of inactivity
- ✅ In-memory storage (no database required)
- ✅ CORS-enabled for cross-origin requests

## Quick Start

### Prerequisites
- Node.js >= 18
- npm or yarn

### Installation

```bash
cd screening-room-backend
npm install
```

### Running Locally

```bash
npm start
```

Server starts on `http://localhost:3001` (configurable via `PORT` env variable):

```bash
PORT=3000 npm start
```

### Health Check

```bash
curl http://localhost:3001/api/health
```

Response:
```json
{
  "ok": true,
  "rooms": 0,
  "uptime": 1234.56
}
```

## Architecture

### REST API

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `POST` | `/api/rooms` | Create a new room | `{ code: "ABC123" }` |
| `GET` | `/api/rooms/:code` | Check room status & get current state | `{ exists, full, occupantCount, video }` |
| `GET` | `/api/health` | Server liveness check | `{ ok, rooms, uptime }` |

### Room State Model

```javascript
{
  code: "ABC123",                    // 6-char alphanumeric room code
  createdAt: 1693456789000,
  lastActivity: 1693456799000,
  occupants: Map {
    "socket-id": { name: "Alice" },
    "socket-id": { name: "Bob" }
  },
  video: {
    url: "https://...",              // Video URL or YouTube link
    isPlaying: true,
    currentTime: 45.5,
    updatedAt: 1693456799000
  }
}
```

### Socket.IO Events

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `room:join` | `{ code, name }` | Join a room with a name |
| `video:load` | `{ url }` | Load a new video URL |
| `video:play` | `{ t }` | Play video at time `t` |
| `video:pause` | `{ t }` | Pause video at time `t` |
| `video:seek` | `{ t }` | Seek to time `t` |
| `chat:message` | `{ text }` | Send a chat message |

#### Server → Client

| Event | Payload | When Sent |
|-------|---------|-----------|
| `room:state` | `{ code, occupantCount, video }` | After client joins (catch-up) |
| `room:join` | `{ occupantCount, name }` | Someone else joins the room |
| `room:leave` | `{ occupantCount }` | Someone leaves the room |
| `room:error` | `{ message }` | Room doesn't exist or is full |
| `video:load` | `{ url }` | Relayed from other occupant |
| `video:play` | `{ t }` | Relayed from other occupant |
| `video:pause` | `{ t }` | Relayed from other occupant |
| `video:seek` | `{ t }` | Relayed from other occupant |
| `chat:message` | `{ text, name }` | Relayed from other occupant |

## Configuration

### Environment Variables

```bash
PORT=3001                    # Server port (default: 3001)
```

### Room Settings

Located in `server.js`:

```javascript
const MAX_OCCUPANTS = 2;             // Max people per room
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;  // 6 hours auto-cleanup
```

## Data Storage

**In-Memory Only** — Rooms are stored in a JavaScript `Map` and exist only for the duration of the server process. This is intentional for a session-based, 2-person app.

### To Use a Database (e.g., Redis)

Replace the `ROOMS` Map in `server.js` with a Redis client:

```javascript
import Redis from 'redis';
const redisClient = new Redis();
// Use redisClient.get/set instead of ROOMS.get/set
```

## API Examples

### Create a Room

```bash
curl -X POST http://localhost:3001/api/rooms
```

Response:
```json
{
  "code": "ABC123"
}
```

### Join a Room (via Socket.IO)

```javascript
const socket = io('http://localhost:3001');
socket.emit('room:join', { code: 'ABC123', name: 'Alice' });

socket.on('room:state', (payload) => {
  console.log('Current room state:', payload);
});
```

### Send a Chat Message

```javascript
socket.emit('chat:message', { text: 'Hello!' });
socket.on('chat:message', (payload) => {
  console.log(`${payload.name}: ${payload.text}`);
});
```

## Deployment

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t screening-room-backend .
docker run -p 3001:3001 screening-room-backend
```

### Heroku

```bash
git push heroku main
```

Make sure `Procfile` includes:
```
web: npm start
```

### Render / Railway / Fly.io

1. Push to GitHub
2. Create new Web Service
3. Build: `npm install` | Start: `npm start`
4. Get public URL (e.g., `https://screening-room.onrender.com`)

## Known Limitations

- Rooms exist in memory only (lost on server restart)
- No user authentication
- No room persistence or history
- Max 2 people per room (enforced)
- Video state is loose (no timestamp sync for YouTube)

## Future Enhancements

- [ ] Persist rooms to Redis/database
- [ ] Support more than 2 users
- [ ] YouTube IFrame API for timestamp accuracy
- [ ] Video duration/progress tracking
- [ ] User authentication
- [ ] Room expiration notifications

## Development

### Running with Nodemon (auto-restart on changes)

```bash
npm install -D nodemon
npx nodemon server.js
```

### Testing the API

```bash
# Health check
curl http://localhost:3001/api/health

# Create room
curl -X POST http://localhost:3001/api/rooms

# Check room status
curl http://localhost:3001/api/rooms/ABC123
```

## Troubleshooting

**Port already in use:**
```bash
lsof -i :3001  # Find process
kill -9 <PID>  # Kill it
```

**CORS errors:**
Check that frontend is making requests to the correct backend URL.

## License

MIT

## Contributing

1. Fork the repo
2. Create a feature branch
3. Submit a pull request

---

Made with ❤️ for synchronized movie nights.

