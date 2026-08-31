import { useState } from 'react'
import { getInitialCodeFromLink } from '../hooks/useScreeningRoom'

const BULB_DELAYS = [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2]

export default function Lobby({ serverConnected, onCreateRoom, onJoinRoom }) {
  const [code, setCode] = useState(getInitialCodeFromLink)
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    setCreating(true)
    await onCreateRoom()
    setCreating(false)
  }

  const handleJoin = () => {
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length < 4) return
    onJoinRoom(trimmed)
  }

  return (
    <section className="screen active" id="lobby">
      <div className="marquee-row" aria-hidden="true">
        {BULB_DELAYS.map((delay, i) => (
          <div className="bulb" key={i} style={{ animationDelay: `${delay}s` }} />
        ))}
      </div>

      <div className="eyebrow">Two seats · one screen</div>
      <h1 className="title display">
        Screening
        <br />
        <em>Room</em>
      </h1>
      <p className="subtitle">
        Open a room, send the link, press play together. Works with any video URL — no downloads, no accounts.
      </p>

      <div className="ticket-row">
        <button
          className="ticket-btn primary"
          onClick={handleCreate}
          style={{ opacity: creating ? 0.6 : 1 }}
          disabled={creating}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="#1a1305" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <span className="ticket-label">
            Create a room
            <small>get a link instantly</small>
          </span>
        </button>

        <div className="ticket-btn secondary" style={{ padding: '14px 20px' }}>
          <span className="ticket-label" style={{ marginBottom: 2 }}>
            <small>Have a code?</small>
          </span>
          <div className="join-inline">
            <input
              type="text"
              maxLength={6}
              placeholder="A1B2C9"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
            <button
              className="ctrl-btn"
              onClick={handleJoin}
              style={{ background: 'var(--gold-dim)', borderRadius: 8, width: 30, height: 30 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="#1a1305" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="lobby-footnote">
        <span className="dot" style={{ background: serverConnected ? '#3fbf6b' : 'var(--muted)' }} />
        <span>{serverConnected ? 'connected to server' : 'connecting to server…'}</span>
      </div>
    </section>
  )
}
