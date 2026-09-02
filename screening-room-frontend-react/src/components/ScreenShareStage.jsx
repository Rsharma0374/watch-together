import { useEffect, useRef, useState } from 'react'
import { useFullscreen } from '../hooks/useFullscreen'

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M4 5h16v11H4z M9 20h6 M12 16v4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SoundIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path d="M16.5 8.5a5 5 0 010 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function FullscreenEnterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
function FullscreenExitIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path
        d="M9 4v5H4M15 4v5h5M20 20v-5h-5M4 20v-5h5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function ScreenShareStage({
  isHost,
  hostName,
  isSharing,
  remoteStream,
  onStartShare,
  onStopShare,
  chatUnread,
  onToggleChat
}) {
  const remoteVideoRef = useRef(null)
  const frameRef = useRef(null)
  const { isFullscreen, toggleFullscreen } = useFullscreen(frameRef)
  const [needsSoundTap, setNeedsSoundTap] = useState(false)

  // Attach the incoming stream and try to play it. Browsers generally
  // block autoplay of audio without a prior user gesture on the page, so
  // if the unmuted attempt is rejected we fall back to a muted autoplay
  // and prompt the guest to tap once to bring the sound in.
  useEffect(() => {
    const el = remoteVideoRef.current
    if (!el || !remoteStream) return

    el.srcObject = remoteStream
    el.muted = false
    el.play()
      .then(() => setNeedsSoundTap(false))
      .catch(() => {
        el.muted = true
        setNeedsSoundTap(true)
        el.play().catch(() => {})
      })
  }, [remoteStream])

  const enableSound = () => {
    const el = remoteVideoRef.current
    if (!el) return
    el.muted = false
    el.play().catch(() => {})
    setNeedsSoundTap(false)
  }

  return (
    <main className="stage">
      {isHost ? (
        <div className="link-bar">
          <span className="share-hint">
            {isSharing
              ? "You're sharing your screen — pick the Hotstar/Netflix tab and check \u201cShare tab audio\u201d for sound."
              : 'Share a browser tab (with audio) so your friend can watch it live, like a screen share on a call.'}
          </span>
          <button className={isSharing ? 'stop-share-btn' : ''} onClick={isSharing ? onStopShare : onStartShare}>
            <ShareIcon />
            {isSharing ? 'Stop sharing' : 'Share my screen'}
          </button>
        </div>
      ) : (
        <div className="link-bar link-bar-readonly">
          <span>
            Watching <strong>{hostName || 'the host'}</strong>'s shared screen
          </span>
        </div>
      )}

      <div className="screen-frame" ref={frameRef}>
        {isHost && !isSharing && (
          <div className="empty-screen">
            <ShareIcon />
            <h3 className="display">Nothing shared yet</h3>
            <p>
              Click "Share my screen" above, then pick the browser tab playing your show. Check "Share tab audio" in
              the picker so your friend hears it too.
            </p>
          </div>
        )}

        {isHost && isSharing && (
          <div className="empty-screen">
            <ShareIcon />
            <h3 className="display">Sharing live</h3>
            <p>Your friend is watching your shared tab now. Playback controls stay in the tab you're sharing.</p>
          </div>
        )}

        {!isHost && !remoteStream && (
          <div className="empty-screen">
            <ShareIcon />
            <h3 className="display">Waiting for the share to start</h3>
            <p>{hostName || 'The host'} hasn't started sharing their screen yet.</p>
          </div>
        )}

        {!isHost && remoteStream && (
          <video ref={remoteVideoRef} autoPlay playsInline />
        )}

        {!isHost && remoteStream && needsSoundTap && (
          <button className="gesture-overlay" onClick={enableSound}>
            <SoundIcon />
            <span>Tap to turn on sound</span>
          </button>
        )}

        {!isHost && remoteStream && (
          <button
            className="fullscreen-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit full screen' : 'Full screen'}
          >
            {isFullscreen ? <FullscreenExitIcon /> : <FullscreenEnterIcon />}
          </button>
        )}

        <div className="controls controls-overlay">
          <span className="share-status">
            {isHost
              ? isSharing
                ? 'Live — sharing your screen and audio'
                : 'Not sharing'
              : remoteStream
                ? 'Watching live'
                : 'Waiting…'}
          </span>
          {!isFullscreen && <ChatToggle unread={chatUnread} onClick={onToggleChat} style={{ marginLeft: 'auto' }} />}
        </div>
      </div>
    </main>
  )
}

function ChatToggle({ unread, onClick, style }) {
  return (
    <button className="chat-toggle" onClick={onClick} style={style}>
      Chat
      {unread > 0 && <span className="unread">{unread}</span>}
    </button>
  )
}
