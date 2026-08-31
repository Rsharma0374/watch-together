# Screening Room — Frontend (React + Vite)

A modern React application for synchronized video watching with a friend. Load any YouTube video or direct video file, hit play, and both viewers stay perfectly in sync with real-time chat.

## Features

- ✅ Create and join ephemeral rooms via 6-character code
- ✅ Sync YouTube videos and direct video files (.mp4, .webm, etc.)
- ✅ Real-time play/pause/seek synchronization
- ✅ Invite friends via shareable URL with room code in hash
- ✅ Live chat with your watching partner
- ✅ Responsive cinema-ticket design
- ✅ Hot module reload (HMR) for instant development updates
- ✅ Production-ready build with Vite

## Project Structure

```
screening-room-frontend-react/
├── src/
│   ├── main.jsx                    # React entry point
│   ├── App.jsx                     # Top-level screen router (lobby ↔ room)
│   ├── hooks/
│   │   └── useScreeningRoom.js     # ALL state + Socket.IO communication
│   ├── lib/
│   │   ├── socket.js               # Shared Socket.IO client singleton
│   │   └── utils.js                # YouTube ID extraction, time formatting
│   ├── components/
│   │   ├── Lobby.jsx               # Create/join room UI
│   │   ├── Room.jsx                # Main room layout
│   │   ├── RoomHeader.jsx          # Room code, leave button, seat count
│   │   ├── VideoStage.jsx          # Video player + controls (HTML5 & YouTube)
│   │   ├── ChatDrawer.jsx          # Slide-in chat panel
│   │   └── Toast.jsx               # Bottom notification toasts
│   └── styles/
│       └── index.css               # Complete design system (cinema theme)
├── index.html
├── vite.config.js
├── package.json
└── .env.example
```

## Quick Start

### Prerequisites
- Node.js >= 18
- npm or yarn
- **Backend running** on `http://localhost:3001` (or configured URL)

### Installation

```bash
cd screening-room-frontend-react
npm install
```

### Development Server

```bash
npm run dev
```

Opens at `http://localhost:5173` in your browser.

Hot module reload (HMR) is enabled — changes save instantly!

### Production Build

```bash
npm run build
```

Optimized bundle in `dist/` folder.

### Preview Production Build

```bash
npm run preview
```

## Configuration

### Backend URL

By default, the app expects the backend at `http://localhost:3001`.

To connect to a different backend:

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and set the backend URL:
   ```
   VITE_BACKEND_URL=https://your-backend-url.com
   ```

3. Restart dev server:
   ```bash
   npm run dev
   ```

## How It Works

### Architecture Overview

```
Lobby → Create Room → Get Code ← Join Room via Code
  ↓                                      ↓
  └─────────→ Room Screen ←─────────────┘
               ↓
       VideoStage + Chat
         ↓
     useScreeningRoom Hook
      (All Socket.IO logic)
         ↓
    Socket.IO Client
         ↓
    Backend @ 3001
```

### State Management

**All state lives in `useScreeningRoom.js` hook:**

```javascript
const roomState = {
  screen: 'lobby' | 'room',          // Current UI view
  serverConnected: boolean,           // Socket.IO connected?
  roomCode: string,                   // e.g., "ABC123"
  occupantCount: number,              // 1 or 2
  video: {
    url: string,                      // Video URL
    isPlaying: boolean,
    currentTime: number               // Seconds
  },
  messages: Array,                    // Chat messages
  unread: number,                     // Unread chat count
  chatOpen: boolean,
  toast: string,                      // Notification text
  actions: {                          // All callbacks
    createRoom, joinRoom, leaveRoom,
    loadVideo, togglePlay,
    handleNativePlay, handleNativePause,
    handleYouTubePlay, handleYouTubePause,
    seekTo, commitSeek,
    sendChat, toggleChat, closeChat
  }
}
```

### Video Sync Flow

#### HTML5 Videos (.mp4, .webm)
1. User A loads video URL → Both see it
2. User A clicks play → Emits `video:play` event
3. Socket.IO broadcasts to User B
4. User B's video state updates → Effect syncs `<video>` element
5. Both play in real-time sync ✅

#### YouTube Videos
1. User loads YouTube link → Extracts video ID
2. YouTube IFrame API loads and creates player
3. User clicks play button
4. Effect calls `player.playVideo()` + emits Socket event
5. User B receives event → their player also plays
6. Both stay in sync ✅

### Room Code Handling

Room codes are encoded in the URL hash for easy sharing:

```
http://localhost:5173/#ABC123
```

Clicking "Create Room" auto-fills the hash. Sharing the link lets friends join directly.

## Component Breakdown

### `App.jsx`
Top-level router. Shows either Lobby or Room based on `screen` state.

### `Lobby.jsx`
- Text input to join via code
- "Create New Room" button
- Checks backend connectivity

### `Room.jsx`
Composes the room layout by combining:
- `RoomHeader` (top bar)
- `VideoStage` (center)
- `ChatDrawer` (right side)

### `VideoStage.jsx` ⭐ (Most Complex)
Handles both video types:
- **HTML5 Videos**: Direct `<video>` element
- **YouTube**: YouTube IFrame API with player control

Features:
- Play/pause button
- Progress bar (HTML5 only)
- Time display
- YouTube API initialization & player sync

### `ChatDrawer.jsx`
Slide-in chat panel:
- Message list
- Text input
- Unread badge

### `RoomHeader.jsx`
Shows room code, occupant count (seat indicators), leave button.

### `Toast.jsx`
Bottom-right notifications for events (video loaded, friend joined, etc.).

## Socket.IO Events

All events are wired up in `useScreeningRoom.js`:

### Sending Events

```javascript
socket.emit('room:join', { code: 'ABC123', name: 'Alice' })
socket.emit('video:load', { url: 'https://...' })
socket.emit('video:play', { t: 45 })
socket.emit('video:pause', { t: 45 })
socket.emit('video:seek', { t: 45 })
socket.emit('chat:message', { text: 'Hello!' })
```

### Listening for Events

```javascript
socket.on('room:state', (payload) => { ... })   // After joining
socket.on('room:join', (payload) => { ... })    // Friend joined
socket.on('room:leave', (payload) => { ... })   // Friend left
socket.on('room:error', (payload) => { ... })   // Error
socket.on('video:load', (payload) => { ... })   // Friend loaded video
socket.on('video:play', (payload) => { ... })   // Friend played
socket.on('video:pause', (payload) => { ... })  // Friend paused
socket.on('video:seek', (payload) => { ... })   // Friend seeked
socket.on('chat:message', (payload) => { ... }) // Friend messaged
```

## Supported Video Formats

### YouTube
- Standard YouTube links: `https://youtu.be/VIDEO_ID`
- Full URLs: `https://www.youtube.com/watch?v=VIDEO_ID`

### Direct Video Files
- `.mp4` (H.264 codec)
- `.webm` (VP8/VP9)
- `.mov` (Safari)
- Any format supported by HTML5 `<video>`

## Key Fixes (v2.0)

### 1. Video Sync on Join
**Problem**: Second person joining didn't see playing video.
**Fix**: Added `useEffect` that waits for video element to load, then syncs playback.

### 2. YouTube Playback Control
**Problem**: YouTube videos had no working controls.
**Fix**: Integrated YouTube IFrame API with play/pause button and state sync.

### 3. Video Switching
**Problem**: Loading different YouTube video after first one failed.
**Fix**: Properly destroy old player before creating new one.

## Development Tips

### Debugging Socket Events
Add logging to `useScreeningRoom.js`:

```javascript
socket.on('video:play', (payload) => {
  console.log('📺 Video playing at:', payload.t)
  onVideoPlay(payload)
})
```

### Testing Locally
Open two browser windows:
1. Left: `http://localhost:5173`
2. Right: `http://localhost:5173` (same or different room)

Paste same YouTube link in both → Click play in one → See it play in both ✅

### Styling
All CSS is in `src/styles/index.css`. Cinema-ticket theme uses:
- Gold & cream colors
- Serif fonts (Fraunces)
- Retro film reel icons

## Deployment

### Vercel (Recommended)

```bash
vercel deploy
```

Set environment variable:
```
VITE_BACKEND_URL=https://your-backend.com
```

### Netlify

```bash
npm run build
netlify deploy --prod --dir=dist
```

Set build environment variable in Netlify dashboard.

### Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist /app/dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
```

Build and run:
```bash
docker build -t screening-room-frontend .
docker run -p 5173:5173 -e VITE_BACKEND_URL=http://backend:3001 screening-room-frontend
```

## Troubleshooting

**Backend connection error:**
- Ensure backend is running on correct port
- Check `VITE_BACKEND_URL` environment variable
- Check browser console for CORS errors

**Video not syncing:**
- Check Socket.IO connection (green dot in top-right)
- Verify backend is receiving events (`npm start` output)
- Refresh both windows and try again

**YouTube video not loading:**
- Verify YouTube URL is correct
- Check browser console for errors
- YouTube embed may be blocked by CORS (rare)

**Chat messages not appearing:**
- Check Socket.IO connection
- Verify backend received `chat:message` event

## Performance

- Built with Vite for fast development & optimized production builds
- Code splitting enabled (components lazy-loaded)
- Images optimized
- Socket.IO events debounced where appropriate

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Android)

## Security Notes

- No authentication (anyone with room code can join)
- HTTPS recommended for production
- No password protection on rooms
- All messages are in-memory only

## Future Enhancements

- [ ] Room password protection
- [ ] Video history/rewinding
- [ ] User avatars
- [ ] Screen share
- [ ] Voice chat
- [ ] Multiple-room support
- [ ] Video quality settings

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -m "Add my feature"`
4. Push to branch: `git push origin feature/my-feature`
5. Submit a pull request

---

Made with ❤️ for shared movie nights.

