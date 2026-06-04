export interface UserSession {
  socketId: string;
  userId: string;
  interests: string[];
  joinedAt: number;
  lastMatchedWith: Set<string>;
  isSearching: boolean;
  currentPeerId: string | null;
  currentRoomId: string | null;
  mode: 'match' | 'jam';
  region?: string;
}

export interface MatchResult {
  roomId: string;
  peerA: string;
  peerB: string;
  sharedInterests: string[];
  initiator: string;
}

export interface JamRoom {
  roomId: string;
  participants: Map<string, { socketId: string; userId: string; interests: string[] }>;
  createdAt: number;
  region: string;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface ReportPayload {
  reason: string;
  details?: string;
}

export interface SessionDescriptionInit {
  type?: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

export interface IceCandidateInit {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}
