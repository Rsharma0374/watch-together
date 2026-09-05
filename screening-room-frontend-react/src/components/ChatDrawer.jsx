import { useEffect, useRef, useState } from 'react'

export default function ChatDrawer({ open, messages, onClose, onSend }) {
  const [text, setText] = useState('')
  const logRef = useRef(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [messages])

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText('')
  }

  return (
    <aside className={`chat-drawer ${open ? 'open' : ''}`}>
      <div className="chat-head">
        <h4>Room chat</h4>
        <button className="chat-close" onClick={onClose}>&times;</button>
      </div>

      <div className="chat-log" ref={logRef}>
        {messages.map((m, i) => (
          <div key={m.id || i} className={`msg ${m.type}`}>
            {m.text}
          </div>
        ))}
      </div>

      <div className="chat-input-row">
        <input
          type="text"
          placeholder="Say something…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button onClick={handleSend}>
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M4 12L20 4L13 20L11 13L4 12Z" fill="#1a1305" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
