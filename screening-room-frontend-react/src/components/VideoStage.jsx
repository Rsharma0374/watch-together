import { useEffect, useRef, useState } from 'react'
import { extractYouTubeId, formatTime } from '../lib/utils'
import { useFullscreen } from '../hooks/useFullscreen'

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M8 5v14l11-7-11-7z" fill="currentColor" />
    </svg>
  )
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />
    </svg>
  )
}
function EmptyReel() {
  return (
    <svg className="reel" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#8a8f9c" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="2.2" fill="#8a8f9c" />
      <circle cx="12" cy="6" r="1.3" fill="#8a8f9c" />
      <circle cx="17" cy="9.5" r="1.3" fill="#8a8f9c" />
      <circle cx="17" cy="14.5" r="1.3" fill="#8a8f9c" />
      <circle cx="7" cy="14.5" r="1.3" fill="#8a8f9c" />
      <circle cx="7" cy="9.5" r="1.3" fill="#8a8f9c" />
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

export default function VideoStage({
  video,
  videoRef,
  isHost,
  hostName,
  needsGesture,
  serverConnected,
  onLoadVideo,
  onTogglePlay,
  onNativePlay,
  onNativePause,
  onTimeUpdate,
  onSeekTo,
  onCommitSeek,
  onResumePlayback,
  onInitialVideoReady,
  onYouTubePlay,
  onYouTubePause
}) {
  const [urlInput, setUrlInput] = useState('')
  const [duration, setDuration] = useState(0)
  const [youtubeApiReady, setYoutubeApiReady] = useState(() => Boolean(window.YT?.Player))
  const youtubePlayerRef = useRef(null)
  const frameRef = useRef(null)
  const { isFullscreen, toggleFullscreen } = useFullscreen(frameRef)
  const ytId = extractYouTubeId(video.url)

  // Load YouTube IFrame API once. The API loads asynchronously, so simply
  // checking window.YT when a late join renders is not enough: it is often
  // still loading at that point and the player would otherwise never mount.
  useEffect(() => {
    if (window.YT?.Player) {
      setYoutubeApiReady(true)
      return
    }

    const previousReadyHandler = window.onYouTubeIframeAPIReady
    const readyHandler = () => {
      previousReadyHandler?.()
      setYoutubeApiReady(true)
    }
    window.onYouTubeIframeAPIReady = readyHandler

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      const firstScriptTag = document.getElementsByTagName('script')[0]
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag)
    }

    return () => {
      // Do not replace a callback installed by another mounted instance.
      if (window.onYouTubeIframeAPIReady === readyHandler) {
        window.onYouTubeIframeAPIReady = previousReadyHandler
      }
    }
  }, [])

  // Initialize YouTube player when iframe is ready
  useEffect(() => {
    if (!ytId || !youtubeApiReady || !window.YT?.Player) return

    const iframeContainer = document.getElementById('youtube-player')
    if (!iframeContainer) return

    // Destroy old player if it exists
    if (youtubePlayerRef.current?.destroy) {
      youtubePlayerRef.current.destroy()
    }

    // Clear the container
    iframeContainer.innerHTML = ''

    // Create new player
    youtubePlayerRef.current = new window.YT.Player('youtube-player', {
      height: '100%',
      width: '100%',
      videoId: ytId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          rel: 0,
        showinfo: 0
      },
      events: {
        onReady: (event) => {
          // A late join has no later event to wait for. Apply the current
          // server snapshot as soon as the embedded player is ready.
          event.target.seekTo(video.currentTime || 0, true)
          if (video.isPlaying) event.target.playVideo()
        },
        onStateChange: (event) => {
          // 1 = PLAYING, 2 = PAUSED
          if (event.data === 1) {
            onYouTubePlay?.()
          } else if (event.data === 2) {
            onYouTubePause?.()
          }
        }
      }
    })

    // Cleanup on unmount
    return () => {
      if (youtubePlayerRef.current?.destroy) {
        youtubePlayerRef.current.destroy()
      }
    }
  }, [ytId, youtubeApiReady])

  // Sync YouTube player state when video state changes (after player is created)
  useEffect(() => {
    const player = youtubePlayerRef.current
    if (!player || !ytId) return

    // Only sync if player has methods available
    if (video.isPlaying && typeof player.playVideo === 'function') {
      player.playVideo()
    } else if (!video.isPlaying && typeof player.pauseVideo === 'function') {
      player.pauseVideo()
    }
  }, [video.isPlaying, ytId])

  useEffect(() => {
    if (video.url) setUrlInput(video.url)
  }, [video.url])

  useEffect(() => {
    setDuration(0)
  }, [video.url])

  const handleLoad = () => {
    if (!isHost) return
    const trimmed = urlInput.trim()
    if (trimmed) onLoadVideo(trimmed)
  }

  const handleYouTubeTogglePlay = () => {
    if (!isHost) return
    const player = youtubePlayerRef.current
    if (!player) return
    if (player.getPlayerState?.() === 1) {
      // Currently playing
      player.pauseVideo()
    } else {
      // Currently paused or stopped
      player.playVideo()
    }
  }

  return (
    <main className="stage">
      {isHost ? (
        <div className="link-bar">
          <input
            type="text"
            placeholder="Paste a YouTube link or direct video URL (.mp4, .webm)…"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
          />
          <button onClick={handleLoad}>Load</button>
        </div>
      ) : (
        <div className="link-bar link-bar-readonly">
          <span>
            Watching as guest — <strong>{hostName || 'the host'}</strong> picks what plays
          </span>
        </div>
      )}

      <div className="screen-frame" ref={frameRef}>
        {!video.url && (
          <div className="empty-screen">
            <EmptyReel />
            <h3 className="display">Nothing's loaded yet</h3>
            <p>
              {isHost
                ? "Paste a link above and hit load — it'll appear here for both of you at once."
                : `Waiting for ${hostName || 'the host'} to load something…`}
            </p>
          </div>
        )}

        {video.url && ytId && (
          <div
            id="youtube-player"
            className={!isHost ? 'guest-player-locked' : ''}
            style={{ width: '100%', height: '100%' }}
          />
        )}

        {video.url && !ytId && (
          <video
            key={video.url}
            ref={videoRef}
            src={video.url}
            onPlay={onNativePlay}
            onPause={onNativePause}
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration || 0)
              onInitialVideoReady?.(e.currentTarget)
            }}
            onCanPlay={(e) => onInitialVideoReady?.(e.currentTarget)}
          />
        )}

        {video.url && needsGesture && (
          <button className="gesture-overlay" onClick={onResumePlayback}>
            <PlayIcon />
            <span>Tap to join playback</span>
          </button>
        )}

        {video.url && (
          <button
            className="fullscreen-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit full screen' : 'Full screen'}
          >
            {isFullscreen ? <FullscreenExitIcon /> : <FullscreenEnterIcon />}
          </button>
        )}

        {video.url && !ytId && isHost && (
          <div className="controls controls-overlay">
            <button className="ctrl-btn" onClick={onTogglePlay}>
              {video.isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>

            <div className="seek-wrap">
              <span className="time">{formatTime(video.currentTime)}</span>
              <input
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={video.currentTime}
                onChange={(e) => onSeekTo(parseFloat(e.target.value))}
                onMouseUp={(e) => onCommitSeek(parseFloat(e.target.value))}
                onTouchEnd={(e) => onCommitSeek(parseFloat(e.target.value))}
              />
              <span className="time">{formatTime(duration)}</span>
            </div>

          </div>
        )}

        {video.url && ytId && isHost && (
          <div className="controls controls-overlay">
            <button className="ctrl-btn" onClick={handleYouTubeTogglePlay}>
              {video.isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
          </div>
        )}
      </div>

      {!isHost && video.url && (
        <p className="guest-note">You're watching — only {hostName || 'the host'} can control playback.</p>
      )}

      <div className="sync-strip">
        <span className="live-dot" style={{ background: serverConnected ? '#3fbf6b' : '#c4485e' }} />
        <span>{serverConnected ? 'Synced live with your room' : 'Reconnecting…'}</span>
      </div>
    </main>
  )
}
