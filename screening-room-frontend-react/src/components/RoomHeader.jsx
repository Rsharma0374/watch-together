function SeatIcon({ filled, waiting, name }) {
  const classes = ['seat', filled ? 'filled' : 'empty', waiting ? 'waiting' : ''].filter(Boolean).join(' ')
  return (
    <div className={classes}>
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M6 10V6a2 2 0 012-2h8a2 2 0 012 2v4M4 12h16v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-1H8v1a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z"
          fill="currentColor"
        />
      </svg>
      <span className="seat-name">{name}</span>
    </div>
  )
}

export default function RoomHeader({ roomCode, occupantCount, onLeave, onCopyLink }) {
  const friendPresent = occupantCount >= 2

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
        <span className="stub-perf" />
        <button className="stub-copy" onClick={copyLink}>Copy invite link</button>
      </div>

      <div className="seats">
        <SeatIcon filled name="YOU" />
        <SeatIcon filled={friendPresent} waiting={!friendPresent} name={friendPresent ? 'FRIEND' : 'EMPTY'} />
      </div>
    </header>
  )
}
