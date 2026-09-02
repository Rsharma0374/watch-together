import RoomHeader from './RoomHeader'
import VideoStage from './VideoStage'
import ScreenShareStage from './ScreenShareStage'
import ChatDrawer from './ChatDrawer'

export default function Room({
  roomCode,
  occupantCount,
  isHost,
  hostName,
  needsGesture,
  stageMode,
  isSharing,
  remoteStream,
  video,
  videoRef,
  serverConnected,
  messages,
  unread,
  chatOpen,
  actions
}) {
  // Guests just follow whatever mode the host picked. Hosts see a small
  // switcher so they can choose between pasting a link and sharing their
  // own screen (with audio) — e.g. for something like Hotstar/Netflix that
  // can't be embedded directly, since it plays inside its own DRM-locked
  // player tied to a login.
  const effectiveMode = stageMode === 'idle' ? 'link' : stageMode

  return (
    <section className="screen active" id="room">
      <RoomHeader
        roomCode={roomCode}
        occupantCount={occupantCount}
        isHost={isHost}
        hostName={hostName}
        onLeave={actions.leaveRoom}
      />

      <div className="room-body">
        <div className="stage-wrap">
          {isHost && (
            <div className="mode-switch">
              <button
                className={effectiveMode === 'link' ? 'active' : ''}
                onClick={() => effectiveMode !== 'link' && actions.stopScreenShare()}
              >
                Paste a link
              </button>
              <button
                className={effectiveMode === 'share' ? 'active' : ''}
                onClick={() => effectiveMode !== 'share' && actions.startScreenShare()}
              >
                Share my screen
              </button>
            </div>
          )}

          {effectiveMode === 'share' ? (
            <ScreenShareStage
              isHost={isHost}
              hostName={hostName}
              isSharing={isSharing}
              remoteStream={remoteStream}
              onStartShare={actions.startScreenShare}
              onStopShare={actions.stopScreenShare}
              chatUnread={unread}
              onToggleChat={actions.toggleChat}
            />
          ) : (
            <VideoStage
              video={video}
              videoRef={videoRef}
              isHost={isHost}
              hostName={hostName}
              needsGesture={needsGesture}
              serverConnected={serverConnected}
              onLoadVideo={actions.loadVideo}
              onTogglePlay={actions.togglePlay}
              onNativePlay={actions.handleNativePlay}
              onNativePause={actions.handleNativePause}
              onTimeUpdate={actions.handleTimeUpdate}
              onSeekTo={actions.seekTo}
              onCommitSeek={actions.commitSeek}
              onResumePlayback={actions.resumePlayback}
              onYouTubePlay={actions.handleYouTubePlay}
              onYouTubePause={actions.handleYouTubePause}
              chatUnread={unread}
              onToggleChat={actions.toggleChat}
            />
          )}
        </div>

        <ChatDrawer open={chatOpen} messages={messages} onClose={actions.closeChat} onSend={actions.sendChat} />
      </div>
    </section>
  )
}
