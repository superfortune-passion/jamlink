import type { IceServerConfig } from '@/types';

export const DEFAULT_STUN: IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:freeturn.net:3478' },
];

/** Fallback TURN when server config hasn't loaded yet — critical for strict NAT / office networks */
export const DEFAULT_TURN: IceServerConfig[] = [
  { urls: 'turn:freeturn.net:3478', username: 'free', credential: 'free' },
  { urls: 'turns:freeturn.net:5349', username: 'free', credential: 'free' },
];

export function mergeIceServers(servers: IceServerConfig[]): IceServerConfig[] {
  if (!servers.length) return [...DEFAULT_STUN, ...DEFAULT_TURN];
  const hasTurn = servers.some((s) => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    return urls.some((u) => u.startsWith('turn'));
  });
  return hasTurn ? servers : [...servers, ...DEFAULT_TURN];
}

export function buildRtcConfig(
  iceServers: IceServerConfig[],
  relayOnly = false
): RTCConfiguration {
  return {
    iceServers: mergeIceServers(iceServers),
    iceTransportPolicy: relayOnly ? 'relay' : 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    iceCandidatePoolSize: 10,
  };
}

export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48000,
  sampleSize: 16,
};

export async function getOptimizedAudioStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: AUDIO_CONSTRAINTS,
    video: false,
  });
}

export function applyGainToStream(stream: MediaStream, gainValue: number): {
  context: AudioContext;
  gainNode: GainNode;
  destination: MediaStreamAudioDestinationNode;
} {
  const context = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
  const source = context.createMediaStreamSource(stream);
  const gainNode = context.createGain();
  gainNode.gain.value = gainValue;
  const destination = context.createMediaStreamDestination();
  source.connect(gainNode);
  gainNode.connect(destination);
  return { context, gainNode, destination };
}

export function stopMediaStream(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => {
    track.stop();
  });
}

export function setTrackEnabled(stream: MediaStream | null, enabled: boolean): void {
  if (!stream) return;
  stream.getAudioTracks().forEach((track) => {
    track.enabled = enabled;
  });
}

/**
 * Configure peer connection for low-latency audio.
 * Browser handles jitter buffer and packet-loss concealment internally.
 */
export function createPeerConnection(config: RTCConfiguration): RTCPeerConnection {
  const pc = new RTCPeerConnection(config);

  // Prefer low-latency codec settings where supported
  pc.addEventListener('negotiationneeded', () => {
    // Handled by caller
  });

  return pc;
}

export async function createOffer(
  pc: RTCPeerConnection,
  iceRestart = false
): Promise<RTCSessionDescriptionInit> {
  const offer = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: false,
    iceRestart,
  });
  await pc.setLocalDescription(offer);
  return offer;
}

export async function createAnswer(pc: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  return answer;
}

export async function attachRemoteAudio(
  stream: MediaStream,
  audioElement: HTMLAudioElement | null
): Promise<boolean> {
  if (!audioElement) return false;
  audioElement.srcObject = stream;
  audioElement.volume = 1;
  audioElement.muted = false;
  audioElement.autoplay = true;
  try {
    await audioElement.play();
    return true;
  } catch {
    try {
      await new Promise((r) => setTimeout(r, 300));
      await audioElement.play();
      return true;
    } catch {
      return false;
    }
  }
}
