import { useScreeningRoom } from './hooks/useScreeningRoom'
import Lobby from './components/Lobby'
import Room from './components/Room'
import Toast from './components/Toast'

export default function App() {
  const roomState = useScreeningRoom()

  return (
    <>
      {roomState.screen === 'lobby' && (
        <Lobby
          serverConnected={roomState.serverConnected}
          onCreateRoom={roomState.actions.createRoom}
          onJoinRoom={roomState.actions.joinRoom}
        />
      )}

      {roomState.screen === 'room' && (
        <Room
          roomCode={roomState.roomCode}
          occupantCount={roomState.occupantCount}
          video={roomState.video}
          videoRef={roomState.videoRef}
          serverConnected={roomState.serverConnected}
          messages={roomState.messages}
          unread={roomState.unread}
          chatOpen={roomState.chatOpen}
          actions={roomState.actions}
        />
      )}

      <Toast text={roomState.toast} />
    </>
  )
}
