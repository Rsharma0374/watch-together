import { io } from 'socket.io-client'

// Change VITE_BACKEND_URL in a .env file (see .env.example), or fall back
// to localhost for local development.
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

// One socket for the whole app's lifetime — created once at import time
// so every component that needs it shares the same connection.
export const socket = io(BACKEND_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling']
})
