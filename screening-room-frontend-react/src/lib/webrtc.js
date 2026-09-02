// Minimal WebRTC helper for the one-host, one-viewer screen share.
// The signaling (SDP offer/answer + ICE candidates) travels over the
// existing Socket.IO connection — see `share:*` / `webrtc:*` events.

// Public STUN server so browsers on different networks/NATs can find a
// direct path to each other. No TURN server is configured, so on some
// strict corporate/mobile networks the connection may fail to establish —
// that's a real limitation worth knowing about, not a bug in this code.
export const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

export function createPeerConnection() {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS })
}

// ICE candidates can arrive before setRemoteDescription() has run (the
// offer/answer round trip and the ICE trickle race each other over the
// network). Queue anything that arrives too early and flush it once the
// remote description is set.
export function makeIceQueue(pc) {
  const queue = []
  let remoteDescriptionSet = false

  return {
    async addCandidate(candidate) {
      if (!candidate) return
      if (remoteDescriptionSet) {
        try {
          await pc.addIceCandidate(candidate)
        } catch {
          // Ignore — a late/duplicate candidate after the connection is
          // already up isn't worth surfacing to the user.
        }
      } else {
        queue.push(candidate)
      }
    },
    async flush() {
      remoteDescriptionSet = true
      while (queue.length) {
        const candidate = queue.shift()
        try {
          await pc.addIceCandidate(candidate)
        } catch {
          // see above
        }
      }
    }
  }
}
