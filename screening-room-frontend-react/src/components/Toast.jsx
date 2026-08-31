export default function Toast({ text }) {
  return (
    <div className={`toast ${text ? 'show' : ''}`}>
      <span className="dot" />
      <span>{text}</span>
    </div>
  )
}
