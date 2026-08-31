import RoomHeader from './RoomHeader'
import VideoStage from './VideoStage'
import ChatDrawer from './ChatDrawer'

export default function Room({
  roomCode,
  occupantCount,
  video,
  videoRef,
  serverConnected,
  messages,
  unread,
  chatOpen,
  actions
}) {
  return (
    <section className="screen active" id="room">
      <RoomHeader roomCode={roomCode} occupantCount={occupantCount} onLeave={actions.leaveRoom} />

      <div className="room-body">
        <VideoStage
          video={video}
          videoRef={videoRef}
          serverConnected={serverConnected}
          onLoadVideo={actions.loadVideo}
          onTogglePlay={actions.togglePlay}
          onNativePlay={actions.handleNativePlay}
          onNativePause={actions.handleNativePause}
          onTimeUpdate={actions.handleTimeUpdate}
          onSeekTo={actions.seekTo}
          onCommitSeek={actions.commitSeek}
          onYouTubePlay={actions.handleYouTubePlay}
          onYouTubePause={actions.handleYouTubePause}
          chatUnread={unread}
          onToggleChat={actions.toggleChat}
        />

        <ChatDrawer open={chatOpen} messages={messages} onClose={actions.closeChat} onSend={actions.sendChat} />
      </div>
    </section>
  )
}
