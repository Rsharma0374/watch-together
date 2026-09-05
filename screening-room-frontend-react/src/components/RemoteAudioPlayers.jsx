import { useEffect, useRef } from 'react'

function AudioTrack({ stream }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.srcObject = stream
    el.play().catch(() => {
      // If the browser blocks this (rare — by the time a voice stream
      // arrives the person has already clicked several buttons in this
      // tab, which usually satisfies the autoplay-with-sound requirement),
      // there's no good non-intrusive way to prompt for it here. It'll
      // start as soon as the person interacts with the page again.
    })
  }, [stream])

  return <audio ref={ref} autoPlay playsInline />
}

// Renders one <audio> element per connected peer's incoming voice stream.
// Invisible — this is purely so the browser actually plays the audio.
export default function RemoteAudioPlayers({ streams }) {
  const entries = Object.entries(streams || {})
  if (entries.length === 0) return null

  return (
    <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
      {entries.map(([id, stream]) => (
        <AudioTrack key={id} stream={stream} />
      ))}
    </div>
  )
}
