# Screening Room 🎬

A real-time, synchronized video-watching application where two people can watch YouTube videos or direct video files together with instant chat. Perfect for movie nights with friends, regardless of distance.

**Live Demo Features:**
- 📺 Load any YouTube video or .mp4/.webm file
- ⏯️ Synchronized play/pause/seek across both viewers
- 💬 Real-time chat while watching
- 🎟️ Cinema-ticket themed UI
- 🔗 Share rooms via URL hash (no signup needed)

---

## 📁 Project Structure

This is a **full-stack monorepo** with two independent services:

```
screening-room/
├── screening-room-backend/          # Node.js + Express + Socket.IO
│   ├── server.js                    # Main server file
│   ├── package.json
│   └── README.md                    # Backend-specific docs
│
├── screening-room-frontend-react/   # React + Vite
│   ├── src/
│   │   ├── components/              # UI components
│   │   ├── hooks/
│   │   │   └── useScreeningRoom.js  # All state & Socket.IO logic
│   │   ├── lib/                     # Utilities & Socket.IO client
│   │   └── styles/
│   ├── vite.config.js
│   ├── package.json
│   └── README.md                    # Frontend-specific docs
│
└── README.md                        # This file (project overview)
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- **Node.js** >= 18
- **npm** or yarn
- Two browser tabs (or windows)

### 1. Start the Backend

```bash
cd screening-room-backend
npm install
npm start
```

✅ Server running on `http://localhost:3001`

### 2. Start the Frontend (New Terminal)

```bash
cd screening-room-frontend-react
npm install
npm run dev
```

✅ App running on `http://localhost:5173`

### 3. Test It Out

1. Open `http://localhost:5173` in **two browser tabs**
2. Tab 1: Click "Create Room" → Get code (e.g., "ABC123")
3. Tab 2: Paste code → Click "Join"
4. Paste YouTube link in Tab 1
5. Click Play in Tab 1
6. ✅ Tab 2 should auto-play in sync!

---

## 📖 Documentation

Each service has detailed documentation in its own README:

- **[Backend README](screening-room-backend/README.md)**
  - REST API reference
  - Socket.IO event documentation
  - Deployment guides (Docker, Heroku, Render)
  - Architecture & data models

- **[Frontend README](screening-room-frontend-react/README.md)**
  - Component structure
  - State management (useScreeningRoom hook)
  - Video sync flow (HTML5 & YouTube)
  - Vite configuration & build

---

## 🏗️ Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (Tab 1 & 2)                     │
│                   screening-room-frontend                   │
│  (React + Vite @ http://localhost:5173)                     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Lobby → Room → VideoStage + Chat                     │   │
│  │         ↓                                            │   │
│  │      useScreeningRoom Hook (All state logic)         │   │
│  │         ↓                                            │   │
│  │      Socket.IO Client (Web socket connection)        │   │
│  └──────────────────────────────────────────────────────┘   │
│                         ↕ (Web Socket)                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│             screening-room-backend                          │
│      (Express + Socket.IO @ localhost:3001)                 │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ REST API:                                            │   │
│  │ • POST   /api/rooms              (create room)       │   │
│  │ • GET    /api/rooms/:code        (check room)        │   │
│  │ • GET    /api/health             (liveness check)    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Socket.IO Events (Real-time Sync):                   │   │
│  │ • room:join / room:leave                             │   │
│  │ • video:load / video:play / video:pause / seek       │   │
│  │ • chat:message                                       │   │
│  │                                                      │   │
│  │ State: In-Memory Map (Rooms auto-expire after 6h)    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow: User A Plays Video

1. **User A** clicks Play button → `onVideoPlay()` fires
2. **React state** updates: `isPlaying: true`
3. **Socket.IO sends**: `video:play` event with timestamp
4. **Backend receives** → broadcasts to User B
5. **User B's React state** updates
6. **Effect watches** state change → syncs video element
7. **Both videos play in sync** ✅

---

## 🎯 Key Features

### ✅ Real-Time Synchronization
- Play/pause/seek events sync instantly via Socket.IO
- Video timestamp synchronized to prevent drift
- Both HTML5 videos and YouTube videos supported

### ✅ YouTube IFrame API Integration
- Full playback control for YouTube videos
- Player state tracking
- Proper cleanup when switching videos

### ✅ No Authentication Required
- Generate ephemeral room codes (6 characters)
- Share via URL hash: `https://example.com/#ABC123`
- Self-expiring rooms (6 hours of inactivity)

### ✅ Chat While Watching
- Real-time messages with sender names
- Unread badge on chat button
- Slide-in drawer UI

### ✅ Cinema-Ticket Design
- Retro cinema aesthetic
- Responsive layout
- Film reel icons
- Gold & cream color scheme

---

## 🛠️ Technology Stack

### Frontend
| Tool | Purpose |
|------|---------|
| **React 18** | UI framework |
| **Vite 5** | Build tool (super fast) |
| **Socket.IO Client** | Real-time communication |
| **CSS3** | Styling (cinema theme) |

### Backend
| Tool | Purpose |
|------|---------|
| **Node.js** | Runtime |
| **Express 4** | HTTP framework |
| **Socket.IO 4** | Real-time events |
| **CORS** | Cross-origin requests |

### Data Storage
| Type | Scope |
|------|-------|
| **In-Memory** | Rooms (Map) |
| **Ephemeral** | Session-based |
| **Auto-cleanup** | 6-hour TTL |

---

## 🚢 Deployment

### Recommended Stack

| Service | Platform | Free Tier | Setup Time |
|---------|----------|-----------|-----------|
| Backend | Render / Railway / Fly.io | ✅ Yes | 5 min |
| Frontend | Vercel / Netlify | ✅ Yes | 5 min |

### Quick Deploy to Render

**Backend:**
```bash
# 1. Push to GitHub
git push origin main

# 2. Go to https://render.com
# 3. Create Web Service → Connect GitHub repo
# 4. Build: npm install | Start: npm start
# 5. Get URL: https://screening-room.onrender.com
```

**Frontend:**
```bash
# 1. Go to https://vercel.com
# 2. Import GitHub repo
# 3. Set env var: VITE_BACKEND_URL=https://screening-room.onrender.com
# 4. Deploy
# 5. Get URL: https://screening-room.vercel.app
```

See detailed deployment guides in:
- [Backend README - Deployment](screening-room-backend/README.md#deployment)
- [Frontend README - Deployment](screening-room-frontend-react/README.md#deployment)

---

## 📝 Recent Improvements (v2.0)

### Bug Fixes
✅ **Video sync on join**: Second person now sees playing video correctly
✅ **YouTube playback**: Full player control implemented
✅ **Video switching**: Can load different videos after first one

### Features
✅ **YouTube IFrame API**: Complete YouTube integration
✅ **Proper cleanup**: Old players destroyed before creating new ones
✅ **Error handling**: Autoplay blocking handled gracefully

---

## 🤝 Contributing

We welcome contributions! Here's how:

1. **Fork** the repo
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** changes: `git commit -m "Add amazing feature"`
4. **Push** to branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### Development Workflow

```bash
# 1. Clone
git clone https://github.com/yourusername/screening-room.git
cd screening-room

# 2. Install both services
cd screening-room-backend && npm install && cd ..
cd screening-room-frontend-react && npm install && cd ..

# 3. Start both (in separate terminals)
cd screening-room-backend && npm start
cd screening-room-frontend-react && npm run dev

# 4. Make changes & test
# 5. Commit & push
# 6. Create PR
```

---

## 🐛 Troubleshooting

### Backend Issues

**Port 3001 already in use:**
```bash
lsof -i :3001
kill -9 <PID>
```

**Backend connection error in frontend:**
- Check backend is running: `curl http://localhost:3001/api/health`
- Check `VITE_BACKEND_URL` in frontend `.env`

### Frontend Issues

**HMR not working:**
- Refresh browser
- Restart dev server: `npm run dev`

**Video not syncing:**
- Check browser console for errors
- Verify Socket.IO connection (green dot in UI)
- Refresh both windows

**YouTube video won't load:**
- Verify URL is correct
- Check browser for CORS errors
- YouTube embeds may be restricted

---

## 📚 API Reference

### REST Endpoints

```bash
# Create room
POST http://localhost:3001/api/rooms
# Returns: { code: "ABC123" }

# Check room status
GET http://localhost:3001/api/rooms/ABC123
# Returns: { exists, full, occupantCount, video }

# Health check
GET http://localhost:3001/api/health
# Returns: { ok, rooms, uptime }
```

### Socket.IO Events

**Sending:**
```javascript
socket.emit('room:join', { code: 'ABC123', name: 'Alice' })
socket.emit('video:load', { url: 'https://...' })
socket.emit('video:play', { t: 45 })
socket.emit('chat:message', { text: 'Great movie!' })
```

**Receiving:**
```javascript
socket.on('room:state', (payload) => { /* joined */ })
socket.on('room:join', (payload) => { /* friend joined */ })
socket.on('video:play', (payload) => { /* friend played */ })
socket.on('chat:message', (payload) => { /* friend messaged */ })
```

See complete event reference in [Backend README](screening-room-backend/README.md#socketio-events).

---

## 🎬 Usage Examples

### Example 1: Local Testing
```bash
# Terminal 1 - Backend
cd screening-room-backend
npm start

# Terminal 2 - Frontend
cd screening-room-frontend-react
npm run dev

# Browser - Tab 1: http://localhost:5173
# Create room, load YouTube video, click play

# Browser - Tab 2: http://localhost:5173
# Join using room code
# Video auto-plays in sync!
```

### Example 2: Deployed Production
```
Frontend: https://screening-room.vercel.app
Backend: https://screening-room-api.onrender.com

User A: Open app, create room
User B: Join using URL: https://screening-room.vercel.app/#ABC123
Both: Videos sync perfectly
```

---

## 📋 Environment Variables

### Frontend `.env`
```
VITE_BACKEND_URL=http://localhost:3001
```

### Backend
```bash
PORT=3001
```

---

## 🔐 Security Notes

⚠️ **Current Limitations:**
- No user authentication
- Room codes are guessable (6-char alphanumeric)
- No encryption on messages
- All data in-memory only

🔒 **Recommendations for Production:**
- Add user authentication (Auth0, Firebase)
- Implement room passwords
- Use HTTPS/WSS
- Add rate limiting
- Persist data to database

---

## 📊 Performance

- ⚡ Vite for instant HMR in development
- 📦 Optimized production builds
- 🚀 Socket.IO for efficient real-time sync
- ♻️ Automatic room cleanup (6-hour TTL)

---

## 🗺️ Roadmap

### Phase 2 (Future)
- [ ] User authentication & profiles
- [ ] Room passwords & invitations
- [ ] Video queue/playlist support
- [ ] User avatars & settings
- [ ] Discord integration
- [ ] Support for 3+ people
- [ ] Screen share capability

### Phase 3 (Long-term)
- [ ] Audio commentary track
- [ ] Reactions & emojis
- [ ] Watch history
- [ ] Ratings & recommendations
- [ ] Custom video subtitles
- [ ] Mobile app (React Native)

---

## 📄 License

MIT License - feel free to use for personal or commercial projects

---

## 🙏 Acknowledgments

Built with ❤️ for synchronized movie nights across the globe.

---

## 📞 Support

- 📖 Check [Backend README](screening-room-backend/README.md) for backend questions
- 🎨 Check [Frontend README](screening-room-frontend-react/README.md) for frontend questions
- 🐛 Open an issue for bugs
- 💡 Open a discussion for feature requests

---

**Made to bring friends together, one video at a time. 🎬🍿**
