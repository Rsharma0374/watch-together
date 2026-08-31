import { useCallback, useEffect, useRef, useState } from 'react'
import { socket, BACKEND_URL } from '../lib/socket'

const EMPTY_VIDEO = { url: null, isPlaying: false, currentTime: 0 }

export function useScreeningRoom() {
  const [screen, setScreen] = useState('lobby') // 'lobby' | 'room'
  const [serverConnected, setServerConnected] = useState(socket.connected)
  const [roomCode, setRoomCode] = useState(null)
  const [occupantCount, setOccupantCount] = useState(1)
  const [video, setVideo] = useState(EMPTY_VIDEO)
  const [messages, setMessages] = useState([{ type: 'system', text: 'room opened' }])
  const [unread, setUnread] = useState(0)
  const [chatOpen, setChatOpen] = useState(false)
  const [toast, setToast] = useState(null)

  const videoRef = useRef(null)
  const suppressRef = useRef(false) // true while applying a remote update, to avoid echoing it back
  const chatOpenRef = useRef(chatOpen)
  chatOpenRef.current = chatOpen
  const toastTimer = useRef(null)

  const showToast = useCallback((text) => {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }, [])

  // ---- bind every socket listener once for the app's lifetime ----
  useEffect(() => {
    const onConnect = () => setServerConnected(true)
    const onDisconnect = () => setServerConnected(false)
    const onConnectError = () => setServerConnected(false)

    const onRoomState = (payload) => {
      setOccupantCount(payload.occupantCount)
      if (payload.video?.url) {
        setVideo({
          url: payload.video.url,
          isPlaying: payload.video.isPlaying,
          currentTime: payload.video.currentTime || 0
        })
      }
      setMessages((m) => [...m, { type: 'system', text: `room ${payload.code} ready` }])
    }

    const onRoomJoin = (payload) => {
      setOccupantCount(payload.occupantCount)
      setMessages((m) => [...m, { type: 'system', text: `${payload.name || 'someone'} joined the room` }])
      showToast('Your friend joined')
    }

    const onRoomLeave = (payload) => {
      setOccupantCount(payload.occupantCount)
      setMessages((m) => [...m, { type: 'system', text: 'they left the room' }])
    }

    const onRoomError = (payload) => {
      showToast(payload.message || "Something went wrong joining that room")
      setScreen('lobby')
    }

    const onVideoLoad = (payload) => {
      setVideo({ url: payload.url, isPlaying: false, currentTime: 0 })
    }

    const onVideoPlay = (payload) => {
      suppressRef.current = true
      setVideo((v) => ({ ...v, isPlaying: true, currentTime: payload.t }))
      if (videoRef.current) {
        videoRef.current.currentTime = payload.t
        videoRef.current.play()
      }
      suppressRef.current = false
    }

    const onVideoPause = (payload) => {
      suppressRef.current = true
      setVideo((v) => ({ ...v, isPlaying: false, currentTime: payload.t }))
      if (videoRef.current) {
        videoRef.current.currentTime = payload.t
        videoRef.current.pause()
      }
      suppressRef.current = false
    }

    const onVideoSeek = (payload) => {
      suppressRef.current = true
      setVideo((v) => ({ ...v, currentTime: payload.t }))
      if (videoRef.current) videoRef.current.currentTime = payload.t
      suppressRef.current = false
    }

    const onChatMessage = (payload) => {
      setMessages((m) => [...m, { type: 'them', text: payload.text, name: payload.name }])
      if (!chatOpenRef.current) setUnread((u) => u + 1)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('room:state', onRoomState)
    socket.on('room:join', onRoomJoin)
    socket.on('room:leave', onRoomLeave)
    socket.on('room:error', onRoomError)
    socket.on('video:load', onVideoLoad)
    socket.on('video:play', onVideoPlay)
    socket.on('video:pause', onVideoPause)
    socket.on('video:seek', onVideoSeek)
    socket.on('chat:message', onChatMessage)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('room:state', onRoomState)
      socket.off('room:join', onRoomJoin)
      socket.off('room:leave', onRoomLeave)
      socket.off('room:error', onRoomError)
      socket.off('video:load', onVideoLoad)
      socket.off('video:play', onVideoPlay)
      socket.off('video:pause', onVideoPause)
      socket.off('video:seek', onVideoSeek)
      socket.off('chat:message', onChatMessage)
    }
  }, [showToast])

  // Sync video playback when the video URL or play state changes
  // This handles the case where onRoomState sets the video state but the element isn't ready yet
  useEffect(() => {
    if (!video.url || !videoRef.current || suppressRef.current) return

    const video_elem = videoRef.current

    const handleCanPlay = () => {
      // Once the video is ready to play, sync the state
      suppressRef.current = true
      video_elem.currentTime = video.currentTime
      if (video.isPlaying) {
        video_elem.play().catch(() => {
          // Autoplay blocked by browser
        })
      } else {
        video_elem.pause()
      }
      suppressRef.current = false
    }

    // Check if video is already loaded
    if (video_elem.readyState >= 2) {
      // HAVE_CURRENT_DATA or better
      handleCanPlay()
    } else {
      // Wait for the video to be ready
      video_elem.addEventListener('canplay', handleCanPlay, { once: true })
      return () => video_elem.removeEventListener('canplay', handleCanPlay)
    }
  }, [video.url, video.isPlaying])

  // pick up a #CODE from a shared invite link on first load
  useEffect(() => {
    const hash = window.location.hash.replace('#', '').trim()
    if (hash && hash.length >= 4) {
      // Lobby reads this via getInitialCode() below; nothing to set here.
    }
  }, [])

  // ---------------- actions ----------------

  const joinRoom = useCallback((code) => {
    setRoomCode(code)
    setScreen('room')
    socket.emit('room:join', { code, name: 'You' })
    window.history.replaceState(null, '', '#' + code)
  }, [])

  const createRoom = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms`, { method: 'POST' })
      if (!res.ok) throw new Error('bad response')
      const { code } = await res.json()
      joinRoom(code)
    } catch (err) {
      showToast('Could not reach the server — is the backend running?')
    }
  }, [joinRoom, showToast])

  const leaveRoom = useCallback(() => {
    setRoomCode(null)
    setScreen('lobby')
    setVideo(EMPTY_VIDEO)
    setMessages([{ type: 'system', text: 'room opened' }])
    setOccupantCount(1)
    setChatOpen(false)
    setUnread(0)
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const loadVideo = useCallback((url) => {
    setVideo({ url, isPlaying: false, currentTime: 0 })
    socket.emit('video:load', { url })
  }, [])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play()
    else v.pause()
  }, [])

  const handleNativePlay = useCallback(() => {
    if (suppressRef.current) return
    const v = videoRef.current
    setVideo((s) => ({ ...s, isPlaying: true }))
    socket.emit('video:play', { t: v.currentTime })
  }, [])

  const handleNativePause = useCallback(() => {
    if (suppressRef.current) return
    const v = videoRef.current
    setVideo((s) => ({ ...s, isPlaying: false }))
    socket.emit('video:pause', { t: v.currentTime })
  }, [])

  const handleTimeUpdate = useCallback(() => {
    if (suppressRef.current) return
    const v = videoRef.current
    setVideo((s) => ({ ...s, currentTime: v.currentTime }))
  }, [])

  const seekTo = useCallback((t) => {
    suppressRef.current = true
    if (videoRef.current) videoRef.current.currentTime = t
    setVideo((s) => ({ ...s, currentTime: t }))
    suppressRef.current = false
  }, [])

  const commitSeek = useCallback((t) => {
    socket.emit('video:seek', { t })
  }, [])

  const sendChat = useCallback((text) => {
    setMessages((m) => [...m, { type: 'me', text }])
    socket.emit('chat:message', { text })
  }, [])

  const toggleChat = useCallback(() => {
    setChatOpen((open) => {
      const next = !open
      if (next) setUnread(0)
      return next
    })
  }, [])

  const closeChat = useCallback(() => setChatOpen(false), [])

  const handleYouTubePlay = useCallback(() => {
    if (suppressRef.current) return
    setVideo((s) => ({ ...s, isPlaying: true }))
    socket.emit('video:play', { t: 0 })
  }, [])

  const handleYouTubePause = useCallback(() => {
    if (suppressRef.current) return
    setVideo((s) => ({ ...s, isPlaying: false }))
    socket.emit('video:pause', { t: 0 })
  }, [])

  return {
    screen,
    serverConnected,
    roomCode,
    occupantCount,
    video,
    messages,
    unread,
    chatOpen,
    toast,
    videoRef,
    actions: {
      createRoom,
      joinRoom,
      leaveRoom,
      loadVideo,
      togglePlay,
      handleNativePlay,
      handleNativePause,
      handleTimeUpdate,
      seekTo,
      commitSeek,
      sendChat,
      toggleChat,
      closeChat,
      handleYouTubePlay,
      handleYouTubePause
    }
  }
}

export function getInitialCodeFromLink() {
  const hash = window.location.hash.replace('#', '').trim()
  return hash && hash.length >= 4 ? hash.toUpperCase() : ''
}
