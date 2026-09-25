import { io } from 'socket.io-client'

// Change VITE_BACKEND_URL in a .env file (see .env.example), or fall back
// to localhost for local development.
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

// Socket.IO's endpoint is configured separately from the URL's namespace.
// The backend is mounted under the same prefix used by the REST API, so
// derive the handshake path from VITE_BACKEND_URL and connect to its origin.
const backend = new URL(BACKEND_URL)
const basePath = backend.pathname.replace(/\/$/, '')
const SOCKET_PATH = `${basePath || ''}/socket.io`

// One socket for the whole app's lifetime — created once at import time
// so every component that needs it shares the same connection.
export const socket = io(backend.origin, {
  autoConnect: true,
  path: SOCKET_PATH,
  transports: ['websocket', 'polling']
})
