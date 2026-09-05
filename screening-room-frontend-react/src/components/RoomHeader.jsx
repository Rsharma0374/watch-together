import { useState } from 'react'

function MicOnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z" fill="currentColor" />
      <path d="M6 11a6 6 0 0012 0M12 19v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 15a3 3 0 003-3V6a3 3 0 00-5.8-1.1M9 9v3a3 3 0 004.2 2.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M6 11a6 6 0 008.6 5.4M12 19v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ParticipantChip({ name, isHost, micOn }) {
  return (
    <div className={`chip ${micOn ? 'chip-speaking' : ''}`}>
      <span className="chip-name">
        {name}
        {isHost && <span className="chip-host"> · host</span>}
      </span>
      <span className={`chip-mic ${micOn ? 'on' : 'off'}`}>{micOn ? <MicOnIcon /> : <MicOffIcon />}</span>
    </div>
  )
}

export default function RoomHeader({
  roomCode,
  occupantCount,
  maxOccupants,
  isHost,
  selfName,
  hostName,
  occupants,
  micOn,
  unread,
  chatOpen,
  onToggleMic,
  onToggleChat,
  onLeave,
  onCopyLink
}) {
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#${roomCode}`
    navigator.clipboard?.writeText(url).catch(() => {})
    onCopyLink?.()
  }

  return (
    <header className="room-header">
      <button className="leave-btn" onClick={onLeave}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Leave room
      </button>

      <div className="stub">
        <span className="stub-code">{roomCode}</span>
        <span className="occupant-count">{occupantCount}/{maxOccupants}</span>
        <span className="stub-perf" />
        <button className="stub-copy" onClick={copyLink}>Copy invite link</button>
      </div>

      <div className="header-right">
        <div className="participants-menu">
          <button
            className="participants-btn"
            onClick={() => setParticipantsOpen((open) => !open)}
            aria-expanded={participantsOpen}
            aria-label="Show people in this room"
            title="People in this room"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M16 20c0-2.2-1.8-4-4-4s-4 1.8-4 4M12 12a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM19 19c0-1.7-.9-3.2-2.3-4M17 5.4a3.5 3.5 0 010 6.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>{occupantCount}</span>
          </button>
          {participantsOpen && (
            <div className="participants-popover" role="dialog" aria-label="People in this room">
              <p className="participants-title">In this room</p>
              <ParticipantChip name={selfName} isHost={isHost} micOn={micOn} />
              {occupants.map((o) => (
                <ParticipantChip key={o.id} name={o.name} isHost={o.isHost} micOn={o.micOn} />
              ))}
            </div>
          )}
        </div>

        <button
          className={`header-chat-btn ${chatOpen ? 'active' : ''}`}
          onClick={onToggleChat}
          aria-expanded={chatOpen}
          aria-label={chatOpen ? 'Hide chat' : 'Show chat'}
          title={chatOpen ? 'Hide chat' : 'Show chat'}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20 11.5a7.5 7.5 0 01-8 7.5 8.7 8.7 0 01-3.3-.7L4 20l1.3-4A7.2 7.2 0 014 11.5 7.5 7.5 0 0112 4a7.5 7.5 0 018 7.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Chat</span>
          {unread > 0 && <span className="header-chat-unread">{unread}</span>}
        </button>

        <button className={`mic-btn ${micOn ? 'on' : 'off'}`} onClick={onToggleMic} title={micOn ? 'Turn mic off' : 'Turn mic on'}>
          {micOn ? <MicOnIcon /> : <MicOffIcon />}
        </button>
      </div>
    </header>
  )
}
