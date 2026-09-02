import { useCallback, useEffect, useRef, useState } from 'react'
import { socket, BACKEND_URL } from '../lib/socket'
import { createPeerConnection, makeIceQueue } from '../lib/webrtc'

const EMPTY_VIDEO = { url: null, isPlaying: false, currentTime: 0 }

export function useScreeningRoom() {
  const [screen, setScreen] = useState('lobby') // 'lobby' | 'room'
  const [serverConnected, setServerConnected] = useState(socket.connected)
  const [roomCode, setRoomCode] = useState(null)
  const [occupantCount, setOccupantCount] = useState(1)
  const [isHost, setIsHost] = useState(true)
  const [hostName, setHostName] = useState(null)
  const [video, setVideo] = useState(EMPTY_VIDEO)
  const [needsGesture, setNeedsGesture] = useState(false)
  const [stageMode, setStageMode] = useState('idle') // 'idle' | 'link' | 'share'
  const [isSharing, setIsSharing] = useState(false) // true on the host while their share is live
  const [remoteStream, setRemoteStream] = useState(null) // the guest's incoming MediaStream
  const [messages, setMessages] = useState([{ type: 'system', text: 'room opened' }])
  const [unread, setUnread] = useState(0)
  const [chatOpen, setChatOpen] = useState(false)
  const [toast, setToast] = useState(null)

  const videoRef = useRef(null)
  const suppressRef = useRef(false) // true while applying a remote update, to avoid echoing it back
  const chatOpenRef = useRef(chatOpen)
  chatOpenRef.current = chatOpen
  const isHostRef = useRef(true) // mirrors isHost for use inside stable callbacks
  const screenRef = useRef(screen) // mirrors screen for use inside stable callbacks
  screenRef.current = screen
  const pcRef = useRef(null) // the active RTCPeerConnection, host or guest side
  const iceQueueRef = useRef(null)
  const localStreamRef = useRef(null) // host's captured display/tab stream
  const isSharingRef = useRef(false) // mirrors isSharing for use inside stable callbacks
  const stopScreenShareRef = useRef(null) // set once stopScreenShare is defined, so loadVideo can call it
  const toastTimer = useRef(null)

  const teardownPeer = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }
    if (pcRef.current) {
      pcRef.current.onicecandidate = null
      pcRef.current.ontrack = null
      pcRef.current.close()
      pcRef.current = null
    }
    iceQueueRef.current = null
  }, [])

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

      // payload.isHost should always be a boolean from a backend running the
      // current server.js. If it's missing, the connected backend is likely
      // running an older copy that predates the host/guest model — fall back
      // to "you're the host" when you're alone in the room (the safe default
      // for a freshly created room) and warn loudly in the console so this
      // mismatch doesn't silently show the wrong UI to whoever created it.
      const resolvedIsHost = typeof payload.isHost === 'boolean' ? payload.isHost : payload.occupantCount <= 1
      if (typeof payload.isHost !== 'boolean') {
        console.warn(
          '[screening-room] room:state was missing "isHost" — the connected backend ' +
          '(check VITE_BACKEND_URL) may be running an outdated server.js. Falling back to a guess.'
        )
      }
      setIsHost(resolvedIsHost)
      isHostRef.current = resolvedIsHost
      setHostName(payload.hostName)
      if (payload.video?.url) {
        setVideo({
          url: payload.video.url,
          isPlaying: payload.video.isPlaying,
          currentTime: payload.video.currentTime || 0
        })
        setStageMode('link')
      }
      setMessages((m) => [
        ...m,
        { type: 'system', text: `room ${payload.code} ready` },
        { type: 'system', text: resolvedIsHost ? "you're the host — you control playback" : "you're watching — only the host controls playback" }
      ])
    }

    const onRoomJoin = (payload) => {
      setOccupantCount(payload.occupantCount)
      setMessages((m) => [...m, { type: 'system', text: `${payload.name || 'someone'} joined the room` }])
      showToast('Your friend joined')
    }

    const onRoomLeave = (payload) => {
      setOccupantCount(payload.occupantCount)
      if (payload.hostName) setHostName(payload.hostName)
      setMessages((m) => [...m, { type: 'system', text: 'they left the room' }])
    }

    const onHostChanged = (payload) => {
      setIsHost(payload.isHost)
      isHostRef.current = payload.isHost
      setHostName(payload.hostName)
      showToast("The host left — you're the host now")
      setMessages((m) => [...m, { type: 'system', text: "you're the host now" }])
    }

    const onRoomError = (payload) => {
      showToast(payload.message || "Something went wrong joining that room")
      // Only bounce back to the lobby for join failures, not for a rejected
      // control action (e.g. a guest's stale button still firing).
      if (screenRef.current !== 'room') setScreen('lobby')
    }

    const onVideoLoad = (payload) => {
      setVideo({ url: payload.url, isPlaying: false, currentTime: 0 })
      setStageMode('link')
    }

    const onVideoPlay = (payload) => {
      suppressRef.current = true
      setVideo((v) => ({ ...v, isPlaying: true, currentTime: payload.t }))
      if (videoRef.current) {
        videoRef.current.currentTime = payload.t
        videoRef.current.play()
          .then(() => setNeedsGesture(false))
          .catch(() => {
            // Browser blocked programmatic autoplay for a guest (no user
            // gesture yet on this tab) — surface a "tap to sync" prompt.
            setNeedsGesture(true)
          })
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

    // ---- screen share signaling ----

    const onShareStart = () => {
      setStageMode('share')
      setMessages((m) => [...m, { type: 'system', text: "the host started sharing their screen" }])
    }

    const onShareStop = () => {
      teardownPeer()
      setRemoteStream(null)
      setIsSharing(false)
      setStageMode((m) => (m === 'share' ? 'idle' : m))
      setMessages((m) => [...m, { type: 'system', text: 'screen share ended' }])
    }

    // Guest side: host's offer arrives, answer it and start receiving.
    const onWebrtcOffer = async ({ sdp }) => {
      if (isHostRef.current) return // only a guest answers
      teardownPeer()
      const pc = createPeerConnection()
      pcRef.current = pc
      const iceQueue = makeIceQueue(pc)
      iceQueueRef.current = iceQueue

      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0])
      }
      pc.onicecandidate = (event) => {
        if (event.candidate) socket.emit('webrtc:ice-candidate', { candidate: event.candidate })
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp))
        await iceQueue.flush()
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.emit('webrtc:answer', { sdp: pc.localDescription })
      } catch (err) {
        showToast('Could not connect to the shared screen')
      }
    }

    // Host side: guest's answer arrives, complete the handshake.
    const onWebrtcAnswer = async ({ sdp }) => {
      if (!pcRef.current) return
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp))
        await iceQueueRef.current?.flush()
      } catch (err) {
        showToast('Screen share connection failed')
      }
    }

    const onWebrtcIceCandidate = ({ candidate }) => {
      iceQueueRef.current?.addCandidate(candidate)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('room:state', onRoomState)
    socket.on('room:join', onRoomJoin)
    socket.on('room:leave', onRoomLeave)
    socket.on('room:host-changed', onHostChanged)
    socket.on('room:error', onRoomError)
    socket.on('video:load', onVideoLoad)
    socket.on('video:play', onVideoPlay)
    socket.on('video:pause', onVideoPause)
    socket.on('video:seek', onVideoSeek)
    socket.on('chat:message', onChatMessage)
    socket.on('share:start', onShareStart)
    socket.on('share:stop', onShareStop)
    socket.on('webrtc:offer', onWebrtcOffer)
    socket.on('webrtc:answer', onWebrtcAnswer)
    socket.on('webrtc:ice-candidate', onWebrtcIceCandidate)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('room:state', onRoomState)
      socket.off('room:join', onRoomJoin)
      socket.off('room:leave', onRoomLeave)
      socket.off('room:host-changed', onHostChanged)
      socket.off('room:error', onRoomError)
      socket.off('video:load', onVideoLoad)
      socket.off('video:play', onVideoPlay)
      socket.off('video:pause', onVideoPause)
      socket.off('video:seek', onVideoSeek)
      socket.off('chat:message', onChatMessage)
      socket.off('share:start', onShareStart)
      socket.off('share:stop', onShareStop)
      socket.off('webrtc:offer', onWebrtcOffer)
      socket.off('webrtc:answer', onWebrtcAnswer)
      socket.off('webrtc:ice-candidate', onWebrtcIceCandidate)
    }
  }, [showToast, teardownPeer])

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
        video_elem.play()
          .then(() => setNeedsGesture(false))
          .catch(() => setNeedsGesture(true)) // autoplay blocked by browser
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
    teardownPeer()
    setRoomCode(null)
    setScreen('lobby')
    setVideo(EMPTY_VIDEO)
    setStageMode('idle')
    setIsSharing(false)
    isSharingRef.current = false
    setRemoteStream(null)
    setMessages([{ type: 'system', text: 'room opened' }])
    setOccupantCount(1)
    setIsHost(true)
    isHostRef.current = true
    setHostName(null)
    setNeedsGesture(false)
    setChatOpen(false)
    setUnread(0)
    window.history.replaceState(null, '', window.location.pathname)
  }, [teardownPeer])

  const stopScreenShare = useCallback(() => {
    teardownPeer()
    setIsSharing(false)
    isSharingRef.current = false
    setStageMode((m) => (m === 'share' ? 'idle' : m))
    if (isHostRef.current) socket.emit('share:stop')
  }, [teardownPeer])
  stopScreenShareRef.current = stopScreenShare

  // Host only. Captures the host's chosen tab/window/screen (with audio,
  // if the browser's share picker offers it) and opens a WebRTC connection
  // to the guest so they receive the same video + audio live.
  const startScreenShare = useCallback(async () => {
    if (!isHostRef.current) return
    if (!navigator.mediaDevices?.getDisplayMedia) {
      showToast('Screen sharing is not supported in this browser')
      return
    }

    let stream
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true // Chrome: only actually captured if "Share tab audio" is checked in the picker
      })
    } catch (err) {
      // User cancelled the picker, or denied permission — not an error to surface loudly.
      return
    }

    teardownPeer()
    localStreamRef.current = stream

    const pc = createPeerConnection()
    pcRef.current = pc
    iceQueueRef.current = makeIceQueue(pc)
    stream.getTracks().forEach((track) => pc.addTrack(track, stream))

    pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit('webrtc:ice-candidate', { candidate: event.candidate })
    }

    // Fires when the user clicks the browser's own "Stop sharing" bar/button.
    stream.getVideoTracks()[0]?.addEventListener('ended', () => stopScreenShareRef.current?.())

    setIsSharing(true)
    isSharingRef.current = true
    setStageMode('share')
    socket.emit('share:start')

    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socket.emit('webrtc:offer', { sdp: pc.localDescription })
    } catch (err) {
      showToast('Could not start the screen share connection')
      stopScreenShareRef.current?.()
    }
  }, [showToast, teardownPeer])

  const loadVideo = useCallback((url) => {
    if (!isHostRef.current) return
    if (isSharingRef.current) stopScreenShareRef.current?.()
    setVideo({ url, isPlaying: false, currentTime: 0 })
    setStageMode('link')
    socket.emit('video:load', { url })
  }, [])

  const togglePlay = useCallback(() => {
    if (!isHostRef.current) return
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play()
    else v.pause()
  }, [])

  const handleNativePlay = useCallback(() => {
    if (suppressRef.current || !isHostRef.current) return
    const v = videoRef.current
    setVideo((s) => ({ ...s, isPlaying: true }))
    socket.emit('video:play', { t: v.currentTime })
  }, [])

  const handleNativePause = useCallback(() => {
    if (suppressRef.current || !isHostRef.current) return
    const v = videoRef.current
    setVideo((s) => ({ ...s, isPlaying: false }))
    socket.emit('video:pause', { t: v.currentTime })
  }, [])

  // Lets a guest satisfy the browser's "needs a user gesture" rule for
  // autoplay, without giving them any actual control over playback — it
  // just resumes the video at whatever time/state the host already set.
  const resumePlayback = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    suppressRef.current = true
    v.play().then(() => setNeedsGesture(false)).catch(() => {})
    suppressRef.current = false
  }, [])

  const handleTimeUpdate = useCallback(() => {
    if (suppressRef.current) return
    const v = videoRef.current
    setVideo((s) => ({ ...s, currentTime: v.currentTime }))
  }, [])

  const seekTo = useCallback((t) => {
    if (!isHostRef.current) return
    suppressRef.current = true
    if (videoRef.current) videoRef.current.currentTime = t
    setVideo((s) => ({ ...s, currentTime: t }))
    suppressRef.current = false
  }, [])

  const commitSeek = useCallback((t) => {
    if (!isHostRef.current) return
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
    if (suppressRef.current || !isHostRef.current) return
    setVideo((s) => ({ ...s, isPlaying: true }))
    socket.emit('video:play', { t: 0 })
  }, [])

  const handleYouTubePause = useCallback(() => {
    if (suppressRef.current || !isHostRef.current) return
    setVideo((s) => ({ ...s, isPlaying: false }))
    socket.emit('video:pause', { t: 0 })
  }, [])

  return {
    screen,
    serverConnected,
    roomCode,
    occupantCount,
    isHost,
    hostName,
    needsGesture,
    stageMode,
    isSharing,
    remoteStream,
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
      resumePlayback,
      sendChat,
      toggleChat,
      closeChat,
      handleYouTubePlay,
      handleYouTubePause,
      startScreenShare,
      stopScreenShare
    }
  }
}

export function getInitialCodeFromLink() {
  const hash = window.location.hash.replace('#', '').trim()
  return hash && hash.length >= 4 ? hash.toUpperCase() : ''
}
