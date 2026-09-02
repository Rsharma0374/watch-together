import { useCallback, useEffect, useState } from 'react'

// Wraps the browser Fullscreen API for a given element ref. Works for any
// container — the YouTube iframe, a native <video>, or the WebRTC remote
// video — since we fullscreen the wrapping div rather than the media
// element itself, so custom controls stay visible while fullscreen.
export function useFullscreen(elementRef) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(!!document.fullscreenElement && document.fullscreenElement === elementRef.current)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [elementRef])

  const toggleFullscreen = useCallback(() => {
    const el = elementRef.current
    if (!el) return

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {
        // Some browsers (notably iOS Safari) don't support element-level
        // fullscreen at all — nothing more we can do here but fail quietly.
      })
    }
  }, [elementRef])

  return { isFullscreen, toggleFullscreen }
}
