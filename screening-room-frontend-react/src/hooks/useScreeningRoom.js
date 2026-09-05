import { useCallback, useEffect, useRef, useState } from 'react'
import { socket, BACKEND_URL } from '../lib/socket'
import { createPeerConnection, makeIceQueue } from '../lib/webrtc'

const EMPTY_VIDEO = { url: null, isPlaying: false, currentTime: 0 }
export const MAX_OCCUPANTS = 5 // keep in sync with the backend's MAX_OCCUPANTS

export function useScreeningRoom() {
  const [screen, setScreen] = useState('lobby') // 'lobby' | 'room'
  const [serverConnected, setServerConnected] = useState(socket.connected)
  const [roomCode, setRoomCode] = useState(null)
  const [selfName, setSelfName] = useState('')
  const [occupantCount, setOccupantCount] = useState(1)
  const [isHost, setIsHost] = useState(true)
  const [hostName, setHostName] = useState(null)
  const [occupants, setOccupants] = useState([]) // everyone else in the room: [{ id, name, isHost, micOn }]
  const [micOn, setMicOn] = useState(false) // this person's own mic state
  const [remoteAudioStreams, setRemoteAudioStreams] = useState({}) // peerId -> MediaStream (voice chat)
  const [video, setVideo] = useState(EMPTY_VIDEO)
  const [needsGesture, setNeedsGesture] = useState(false)
  const [stageMode, setStageMode] = useState('idle') // 'idle' | 'link' | 'share'
  const [isSharing, setIsSharing] = useState(false) // true on the host while their share is live
  const [remoteStream, setRemoteStream] = useState(null) // guest's incoming screen-share MediaStream
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
  const occupantsRef = useRef([]) // mirrors occupants for use inside stable callbacks
  occupantsRef.current = occupants
  const micOnRef = useRef(false) // mirrors micOn for use inside stable callbacks
  micOnRef.current = micOn

  // Screen share: guest side keeps one incoming connection (there's only
  // ever one host). Host side keeps one outgoing connection per guest.
  const pcRef = useRef(null)
  const iceQueueRef = useRef(null)
  // ICE may reach a guest before the SDP offer. Keep those candidates by
  // sender until onWebrtcOffer has created its peer connection and queue.
  const pendingIncomingShareIceRef = useRef(new Map())
  const localStreamRef = useRef(null) // host's captured display/tab stream
  const hostSharePeersRef = useRef(new Map()) // guestId -> { pc, iceQueue } (host only)
  const isSharingRef = useRef(false) // mirrors isSharing for use inside stable callbacks
  const stopScreenShareRef = useRef(null) // set once stopScreenShare is defined, so loadVideo can call it

  // Voice chat: a full mesh, one connection per other occupant, created
  // lazily the first time it's needed (either side turns their mic on).
  const voicePeersRef = useRef(new Map()) // peerId -> { pc, iceQueue }
  const localAudioStreamRef = useRef(null) // this person's captured mic stream

  const toastTimer = useRef(null)
  // Keeps a short record of messages this browser just sent. Some older
  // backend deployments broadcast chat messages to every socket (including
  // the sender) without an id/from field; this lets the UI still ignore that
  // legacy echo while the backend is being restarted.
  const sentChatRef = useRef(new Map())

  const showToast = useCallback((text) => {
    setToast(text)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }, [])

  // ---- screen share peer helpers (host side: one per guest) ----

  const teardownSharePeer = useCallback((peerId) => {
    const entry = hostSharePeersRef.current.get(peerId)
    if (entry) {
      entry.pc.onicecandidate = null
      entry.pc.close()
    }
    hostSharePeersRef.current.delete(peerId)
  }, [])

  const teardownAllSharePeers = useCallback(() => {
    hostSharePeersRef.current.forEach((_, id) => teardownSharePeer(id))
  }, [teardownSharePeer])

  // Guest-side single incoming connection (from whoever is hosting).
  const teardownIncomingShare = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.onicecandidate = null
      pcRef.current.ontrack = null
      pcRef.current.close()
      pcRef.current = null
    }
    iceQueueRef.current = null
  }, [])

  const connectShareToPeer = useCallback((peerId) => {
    if (!localStreamRef.current) return
    teardownSharePeer(peerId) // replace any stale connection to this guest

    const pc = createPeerConnection()
    const iceQueue = makeIceQueue(pc)
    localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current))
    pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit('webrtc:ice-candidate', { to: peerId, candidate: event.candidate })
    }
    hostSharePeersRef.current.set(peerId, { pc, iceQueue })

    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => socket.emit('webrtc:offer', { to: peerId, sdp: pc.localDescription }))
      .catch(() => showToast('Could not connect the screen share to a viewer'))
  }, [showToast, teardownSharePeer])

  // ---- voice chat peer helpers (mesh: one per other occupant) ----

  const getOrCreateVoicePeer = useCallback((peerId) => {
    let entry = voicePeersRef.current.get(peerId)
    if (entry) return entry

    const pc = createPeerConnection()
    const iceQueue = makeIceQueue(pc)

    pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit('voice:ice-candidate', { to: peerId, candidate: event.candidate })
    }
    pc.ontrack = (event) => {
      setRemoteAudioStreams((prev) => ({ ...prev, [peerId]: event.streams[0] }))
    }
    // Fires automatically whenever a track is added to this connection
    // (including later, when someone turns their mic on after the
    // connection already exists) — this is what drives re-negotiation.
    pc.onnegotiationneeded = async () => {
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socket.emit('voice:offer', { to: peerId, sdp: pc.localDescription })
      } catch {
        // A glare (both sides negotiating at once) is possible but rare at
        // this room size — not worth full perfect-negotiation handling here.
      }
    }

    entry = { pc, iceQueue }
    voicePeersRef.current.set(peerId, entry)
    return entry
  }, [])

  const teardownVoicePeer = useCallback((peerId) => {
    const entry = voicePeersRef.current.get(peerId)
    if (entry) {
      entry.pc.onicecandidate = null
      entry.pc.ontrack = null
      entry.pc.onnegotiationneeded = null
      entry.pc.close()
    }
    voicePeersRef.current.delete(peerId)
    setRemoteAudioStreams((prev) => {
      if (!(peerId in prev)) return prev
      const next = { ...prev }
      delete next[peerId]
      return next
    })
  }, [])

  const teardownAllVoicePeers = useCallback(() => {
    voicePeersRef.current.forEach((_, id) => teardownVoicePeer(id))
  }, [teardownVoicePeer])

  const clearRoom = useCallback(() => {
    teardownIncomingShare()
    teardownAllSharePeers()
    teardownAllVoicePeers()
    if (localAudioStreamRef.current) {
      localAudioStreamRef.current.getTracks().forEach((t) => t.stop())
      localAudioStreamRef.current = null
    }
    setRoomCode(null)
    setScreen('lobby')
    setVideo(EMPTY_VIDEO)
    setStageMode('idle')
    setIsSharing(false)
    isSharingRef.current = false
    setRemoteStream(null)
    setOccupants([])
    setRemoteAudioStreams({})
    setMicOn(false)
    micOnRef.current = false
    setMessages([{ type: 'system', text: 'room opened' }])
    setOccupantCount(1)
    setIsHost(true)
    isHostRef.current = true
    setHostName(null)
    setNeedsGesture(false)
    setChatOpen(false)
    setUnread(0)
    window.history.replaceState(null, '', window.location.pathname)
  }, [teardownIncomingShare, teardownAllSharePeers, teardownAllVoicePeers])

  // ---- bind every socket listener once for the app's lifetime ----
  useEffect(() => {
    const onConnect = () => setServerConnected(true)
    const onDisconnect = () => setServerConnected(false)
    const onConnectError = () => setServerConnected(false)

    const onRoomState = (payload) => {
      setOccupantCount(payload.occupantCount)

      // payload.isHost should always be a boolean from a backend running the
      // current server.js. If it's missing, the connected backend is likely
      // running an older copy — fall back to "you're the host" when you're
      // alone in the room, and warn loudly so the mismatch isn't silent.
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

      const peers = Array.isArray(payload.peers)
        ? payload.peers.map((p) => ({ id: p.id, name: p.name, isHost: p.isHost, micOn: !!p.micOn }))
        : []
      setOccupants(peers)

      if (payload.video?.url) {
        setVideo({
          url: payload.video.url,
          isPlaying: payload.video.isPlaying,
          currentTime: payload.video.currentTime || 0
        })
        setStageMode('link')
      } else if (payload.sharing) {
        // The host is already sharing — wait here for their offer, which
        // arrives separately via 'webrtc:offer' once they see this join.
        setStageMode('share')
      }

      setMessages((m) => [
        ...m,
        { type: 'system', text: `room ${payload.code} ready` },
        { type: 'system', text: resolvedIsHost ? "you're the host — you control playback" : "you're watching — only the host controls playback" }
      ])
      showToast(`Joined ${payload.code}`)
    }

    const onRoomJoin = (payload) => {
      setOccupantCount(payload.occupantCount)

      if (payload.id) {
        setOccupants((prev) =>
          prev.some((o) => o.id === payload.id)
            ? prev
            : [...prev, { id: payload.id, name: payload.name, isHost: payload.isHost, micOn: false }]
        )

        // If I'm the host mid-share, bring the new person into it.
        if (isHostRef.current && isSharingRef.current) connectShareToPeer(payload.id)

        // If my mic is already on, open (or extend) a voice connection to
        // them too, so they can hear me without needing to do anything.
        if (micOnRef.current && localAudioStreamRef.current) {
          const { pc } = getOrCreateVoicePeer(payload.id)
          const track = localAudioStreamRef.current.getAudioTracks()[0]
          if (track && !pc.getSenders().some((s) => s.track === track)) {
            pc.addTrack(track, localAudioStreamRef.current)
          }
        }
      }

      setMessages((m) => [...m, { type: 'system', text: `${payload.name || 'someone'} joined the room` }])
      showToast(`${payload.name || 'Someone'} joined`)
    }

    const onRoomLeave = (payload) => {
      setOccupantCount(payload.occupantCount)
      if (payload.hostName) setHostName(payload.hostName)

      if (payload.id) {
        setOccupants((prev) => prev.filter((o) => o.id !== payload.id))
        teardownVoicePeer(payload.id)
        teardownSharePeer(payload.id)
      }

      setMessages((m) => [...m, { type: 'system', text: `${payload.name || 'Someone'} left the room` }])
    }

    const onRoomClosed = (payload) => {
      // Leave the now-destroyed Socket.IO room too, so this connection cannot
      // retain stale membership if it joins another room afterward.
      socket.emit('room:leave')
      clearRoom()
      showToast(payload.message || 'The host closed this room')
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
      // Ignore an accidental server echo of our own message, and de-duplicate
      // any retried Socket.IO delivery using the client-generated message id.
      const now = Date.now()
      for (const [id, sent] of sentChatRef.current) {
        if (now - sent.sentAt > 30_000) sentChatRef.current.delete(id)
      }
      const isOwnLegacyEcho = !payload.id && [...sentChatRef.current.values()]
        .some((sent) => sent.text === payload.text)
      if ((payload.from && payload.from === socket.id) || (payload.id && sentChatRef.current.has(payload.id)) || isOwnLegacyEcho) return
      setMessages((m) => {
        if (payload.id && m.some((message) => message.id === payload.id)) return m
        return [...m, { id: payload.id, type: 'them', text: payload.text, name: payload.name }]
      })
      if (!chatOpenRef.current) setUnread((u) => u + 1)
    }

    // ---- screen share signaling ----

    const onShareStart = () => {
      setStageMode('share')
      setMessages((m) => [...m, { type: 'system', text: "the host started sharing their screen" }])
    }

    const onShareStop = () => {
      teardownIncomingShare()
      pendingIncomingShareIceRef.current.clear()
      setRemoteStream(null)
      setStageMode((m) => (m === 'share' ? 'idle' : m))
      setMessages((m) => [...m, { type: 'system', text: 'screen share ended' }])
    }

    // Guest side: an offer arrives from whoever is hosting; answer it.
    const onWebrtcOffer = async ({ from, sdp }) => {
      if (isHostRef.current) return // hosts don't receive screen-share offers
      const earlyCandidates = pendingIncomingShareIceRef.current.get(from) || []
      pendingIncomingShareIceRef.current.delete(from)
      teardownIncomingShare()
      const pc = createPeerConnection()
      pcRef.current = pc
      const iceQueue = makeIceQueue(pc)
      iceQueueRef.current = iceQueue

      earlyCandidates.forEach((candidate) => iceQueue.addCandidate(candidate))

      pc.ontrack = (event) => setRemoteStream(event.streams[0])
      pc.onicecandidate = (event) => {
        if (event.candidate) socket.emit('webrtc:ice-candidate', { to: from, candidate: event.candidate })
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp))
        await iceQueue.flush()
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.emit('webrtc:answer', { to: from, sdp: pc.localDescription })
      } catch (err) {
        showToast('Could not connect to the shared screen')
      }
    }

    // Host side: a guest's answer arrives, complete their handshake.
    const onWebrtcAnswer = async ({ from, sdp }) => {
      const entry = hostSharePeersRef.current.get(from)
      if (!entry) return
      try {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp))
        await entry.iceQueue.flush()
      } catch (err) {
        showToast('Screen share connection failed')
      }
    }

    const onWebrtcIceCandidate = ({ from, candidate }) => {
      if (isHostRef.current) {
        hostSharePeersRef.current.get(from)?.iceQueue.addCandidate(candidate)
      } else {
        if (iceQueueRef.current) {
          iceQueueRef.current.addCandidate(candidate)
        } else {
          const pending = pendingIncomingShareIceRef.current.get(from) || []
          pending.push(candidate)
          pendingIncomingShareIceRef.current.set(from, pending)
        }
      }
    }

    // ---- voice chat signaling ----

    const onVoiceOffer = async ({ from, sdp }) => {
      const { pc, iceQueue } = getOrCreateVoicePeer(from)
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp))
        await iceQueue.flush()
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.emit('voice:answer', { to: from, sdp: pc.localDescription })
      } catch {
        // Best-effort — an occasional dropped voice connection isn't worth
        // interrupting the room with a toast.
      }
    }

    const onVoiceAnswer = async ({ from, sdp }) => {
      const entry = voicePeersRef.current.get(from)
      if (!entry) return
      try {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp))
        await entry.iceQueue.flush()
      } catch {
        // see above
      }
    }

    const onVoiceIceCandidate = ({ from, candidate }) => {
      voicePeersRef.current.get(from)?.iceQueue.addCandidate(candidate)
    }

    const onMicState = ({ id, on }) => {
      setOccupants((prev) => prev.map((o) => (o.id === id ? { ...o, micOn: on } : o)))
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('room:state', onRoomState)
    socket.on('room:join', onRoomJoin)
    socket.on('room:leave', onRoomLeave)
    socket.on('room:closed', onRoomClosed)
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
    socket.on('voice:offer', onVoiceOffer)
    socket.on('voice:answer', onVoiceAnswer)
    socket.on('voice:ice-candidate', onVoiceIceCandidate)
    socket.on('voice:mic-state', onMicState)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('room:state', onRoomState)
      socket.off('room:join', onRoomJoin)
      socket.off('room:leave', onRoomLeave)
      socket.off('room:closed', onRoomClosed)
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
      socket.off('voice:offer', onVoiceOffer)
      socket.off('voice:answer', onVoiceAnswer)
      socket.off('voice:ice-candidate', onVoiceIceCandidate)
      socket.off('voice:mic-state', onMicState)
    }
  }, [showToast, clearRoom, teardownIncomingShare, teardownVoicePeer, teardownSharePeer, connectShareToPeer, getOrCreateVoicePeer])

  useEffect(() => {
    const hash = window.location.hash.replace('#', '').trim()
    if (hash && hash.length >= 4) {
      // Lobby reads this via getInitialCode() below; nothing to set here.
    }
  }, [])

  // ---------------- actions ----------------

  const joinRoom = useCallback((code, name) => {
    const safeName = name.trim().slice(0, 32)
    if (!safeName) {
      showToast('Enter your name to join the room')
      return
    }
    setSelfName(safeName)
    setRoomCode(code)
    setScreen('room')
    socket.emit('room:join', { code, name: safeName })
    window.history.replaceState(null, '', '#' + code)
  }, [showToast])

  const createRoom = useCallback(async (name) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/rooms`, { method: 'POST' })
      if (!res.ok) throw new Error('bad response')
      const { code } = await res.json()
      joinRoom(code, name)
    } catch (err) {
      showToast('Could not reach the server — is the backend running?')
    }
  }, [joinRoom, showToast])

  const leaveRoom = useCallback(() => {
    socket.emit('room:leave')
    clearRoom()
  }, [clearRoom])

  const stopScreenShare = useCallback(() => {
    teardownAllSharePeers()
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }
    setIsSharing(false)
    isSharingRef.current = false
    setStageMode((m) => (m === 'share' ? 'idle' : m))
    if (isHostRef.current) socket.emit('share:stop')
  }, [teardownAllSharePeers])
  stopScreenShareRef.current = stopScreenShare

  // Host only. Captures the host's chosen tab/window/screen (with audio,
  // if the browser's share picker offers it) and opens a WebRTC connection
  // to every current guest so they all receive the same video + audio live.
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

    teardownAllSharePeers()
    localStreamRef.current = stream

    // Fires when the user clicks the browser's own "Stop sharing" bar/button.
    stream.getVideoTracks()[0]?.addEventListener('ended', () => stopScreenShareRef.current?.())

    setIsSharing(true)
    isSharingRef.current = true
    setStageMode('share')
    socket.emit('share:start')

    occupantsRef.current.forEach((o) => connectShareToPeer(o.id))
  }, [showToast, teardownAllSharePeers, connectShareToPeer])

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

  // The initial room snapshot can arrive before the guest's <video> has
  // loaded its metadata. VideoStage calls this once it is ready so a late
  // join starts at the live position (and gets the same autoplay prompt as
  // realtime play events if the browser requires a gesture).
  const syncInitialVideo = useCallback((element) => {
    if (isHostRef.current || !element) return
    suppressRef.current = true
    element.currentTime = video.currentTime || 0
    if (video.isPlaying) {
      element.play().then(() => setNeedsGesture(false)).catch(() => setNeedsGesture(true))
    }
    suppressRef.current = false
  }, [video.currentTime, video.isPlaying])

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
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
    sentChatRef.current.set(id, { text, sentAt: Date.now() })
    setMessages((m) => [...m, { id, type: 'me', text }])
    socket.emit('chat:message', { id, text })
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

  // Turning the mic on requests microphone permission (once — the captured
  // stream is kept afterward), then makes sure every current peer has a
  // connection carrying this person's audio track. Turning it off just
  // disables the track locally — the connections stay open so turning it
  // back on is instant, with no permission prompt or renegotiation delay.
  const toggleMic = useCallback(async () => {
    if (!micOnRef.current) {
      if (!localAudioStreamRef.current) {
        try {
          localAudioStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
        } catch (err) {
          showToast('Microphone permission denied')
          return
        }
      }
      const track = localAudioStreamRef.current.getAudioTracks()[0]
      if (track) track.enabled = true

      occupantsRef.current.forEach((o) => {
        const { pc } = getOrCreateVoicePeer(o.id)
        if (track && !pc.getSenders().some((s) => s.track === track)) {
          pc.addTrack(track, localAudioStreamRef.current)
        }
      })

      setMicOn(true)
      micOnRef.current = true
      socket.emit('voice:mic-state', { on: true })
    } else {
      const track = localAudioStreamRef.current?.getAudioTracks()[0]
      if (track) track.enabled = false
      setMicOn(false)
      micOnRef.current = false
      socket.emit('voice:mic-state', { on: false })
    }
  }, [showToast, getOrCreateVoicePeer])

  return {
    screen,
    serverConnected,
    roomCode,
    selfName,
    occupantCount,
    maxOccupants: MAX_OCCUPANTS,
    isHost,
    hostName,
    occupants,
    micOn,
    remoteAudioStreams,
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
      syncInitialVideo,
      sendChat,
      toggleChat,
      closeChat,
      handleYouTubePlay,
      handleYouTubePause,
      startScreenShare,
      stopScreenShare,
      toggleMic
    }
  }
}

export function getInitialCodeFromLink() {
  const hash = window.location.hash.replace('#', '').trim()
  return hash && hash.length >= 4 ? hash.toUpperCase() : ''
}
