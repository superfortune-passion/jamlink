export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'searching'
  | 'matched'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type MatchMode = 'match' | 'jam';

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface MatchedPayload {
  roomId: string;
  peerId: string;
  sharedInterests: string[];
  isInitiator: boolean;
}

export interface JamMatchedPayload {
  roomId: string;
  participants: { socketId: string; userId: string; interests: string[] }[];
  sharedInterests: string[];
  region: string;
  serverTime: number;
  initiator: string;
}

export interface Interest {
  id: string;
  title: string;
  icon: string;
  priority?: boolean;
}

export interface SignalingEvents {
  connected: { userId: string; iceServers: IceServerConfig[] };
  searching: { interests: string[]; mode: MatchMode };
  matched: MatchedPayload;
  'jam-matched': JamMatchedPayload;
  'peer-disconnected': { reason: string };
  offer: { roomId: string; sdp: RTCSessionDescriptionInit; from: string };
  answer: { roomId: string; sdp: RTCSessionDescriptionInit; from: string };
  'ice-candidate': { roomId: string; candidate: RTCIceCandidateInit; from: string };
  'presence-update': { online: number };
  error: { code: string; message: string };
  'report-received': { success: boolean };
}
