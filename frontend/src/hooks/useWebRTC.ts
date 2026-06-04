'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  buildRtcConfig,
  createPeerConnection,
  createOffer,
  createAnswer,
  getOptimizedAudioStream,
  stopMediaStream,
  setTrackEnabled,
  attachRemoteAudio,
} from '@/lib/webrtc';
import type { IceServerConfig } from '@/types';

interface UseWebRTCOptions {
  iceServers: IceServerConfig[];
  onIceCandidate: (roomId: string, candidate: RTCIceCandidateInit) => void;
}

interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isConnected: boolean;
  needsAudioUnlock: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'unknown';
  initLocalStream: () => Promise<MediaStream | null>;
  startCallAsInitiator: (roomId: string, forceRelay?: boolean) => Promise<RTCSessionDescriptionInit | null>;
  handleOffer: (
    sdp: RTCSessionDescriptionInit,
    roomId: string,
    forceRelay?: boolean
  ) => Promise<RTCSessionDescriptionInit>;
  handleAnswer: (sdp: RTCSessionDescriptionInit) => Promise<void>;
  handleIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
  unlockRemoteAudio: () => Promise<void>;
  toggleMute: () => void;
  endCall: () => void;
  remoteAudioRef: React.RefObject<HTMLAudioElement>;
}

function hasLiveAudioTrack(stream: MediaStream | null): boolean {
  return !!stream?.getAudioTracks().some((t) => t.readyState === 'live');
}

export function useWebRTC({ iceServers, onIceCandidate }: UseWebRTCOptions): UseWebRTCReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'poor' | 'unknown'>('unknown');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const activeRoomIdRef = useRef<string | null>(null);
  const iceServersRef = useRef(iceServers);
  const onIceCandidateRef = useRef(onIceCandidate);
  const localStreamRef = useRef<MediaStream | null>(null);

  iceServersRef.current = iceServers;
  onIceCandidateRef.current = onIceCandidate;
  localStreamRef.current = localStream;

  const cleanupPeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    pendingCandidatesRef.current = [];
    activeRoomIdRef.current = null;
    setRemoteStream(null);
    setIsConnected(false);
    setNeedsAudioUnlock(false);
    setConnectionQuality('unknown');
  }, []);

  const endCall = useCallback(() => {
    cleanupPeerConnection();
    stopMediaStream(localStreamRef.current);
    setLocalStream(null);
    localStreamRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  }, [cleanupPeerConnection]);

  const initLocalStream = useCallback(async (): Promise<MediaStream | null> => {
    if (hasLiveAudioTrack(localStreamRef.current)) {
      return localStreamRef.current;
    }
    try {
      stopMediaStream(localStreamRef.current);
      const stream = await getOptimizedAudioStream();
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('Microphone access denied:', err);
      return null;
    }
  }, []);

  const flushPendingCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc?.remoteDescription) return;

    const pending = [...pendingCandidatesRef.current];
    pendingCandidatesRef.current = [];

    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // Stale candidate
      }
    }
  }, []);

  const handleRemoteTrack = useCallback(async (remote: MediaStream) => {
    setRemoteStream(remote);
    const played = await attachRemoteAudio(remote, remoteAudioRef.current);
    if (!played) setNeedsAudioUnlock(true);
    setIsConnected(true);
  }, []);

  const setupPeerConnection = useCallback(
    (stream: MediaStream, roomId: string, relayOnly = false) => {
      cleanupPeerConnection();
      activeRoomIdRef.current = roomId;

      const config = buildRtcConfig(iceServersRef.current, relayOnly);
      const pc = createPeerConnection(config);
      pcRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      pc.ontrack = (event) => {
        const remote = event.streams?.[0] ?? new MediaStream([event.track]);
        void handleRemoteTrack(remote);
      };

      pc.onicecandidate = (event) => {
        const rid = activeRoomIdRef.current;
        if (event.candidate && rid) {
          onIceCandidateRef.current(rid, event.candidate.toJSON());
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'connected') {
          setIsConnected(true);
        } else if (state === 'failed') {
          setConnectionQuality('poor');
          setIsConnected(false);
        } else if (state === 'closed') {
          setIsConnected(false);
        }
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        if (state === 'connected' || state === 'completed') {
          setConnectionQuality('excellent');
          setIsConnected(true);
        } else if (state === 'checking' || state === 'new') {
          setConnectionQuality('good');
        } else if (state === 'disconnected') {
          setConnectionQuality('poor');
        } else if (state === 'failed') {
          setConnectionQuality('poor');
          setIsConnected(false);
        }
      };

      return pc;
    },
    [cleanupPeerConnection, handleRemoteTrack]
  );

  const startCallAsInitiator = useCallback(
    async (roomId: string, forceRelay = false): Promise<RTCSessionDescriptionInit | null> => {
      const stream = await initLocalStream();
      if (!stream) return null;

      const pc = setupPeerConnection(stream, roomId, forceRelay);
      const offer = await createOffer(pc);
      await flushPendingCandidates();
      return offer;
    },
    [initLocalStream, setupPeerConnection, flushPendingCandidates]
  );

  const handleOffer = useCallback(
    async (
      sdp: RTCSessionDescriptionInit,
      roomId: string,
      forceRelay = false
    ): Promise<RTCSessionDescriptionInit> => {
      const stream = await initLocalStream();
      if (!stream) throw new Error('No local stream');

      const pc = setupPeerConnection(stream, roomId, forceRelay);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await flushPendingCandidates();

      const answer = await createAnswer(pc);
      await flushPendingCandidates();
      return answer;
    },
    [initLocalStream, setupPeerConnection, flushPendingCandidates]
  );

  const handleAnswer = useCallback(
    async (sdp: RTCSessionDescriptionInit) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await flushPendingCandidates();
    },
    [flushPendingCandidates]
  );

  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    if (!candidate.candidate) return;
    const pc = pcRef.current;
    if (!pc) {
      pendingCandidatesRef.current.push(candidate);
      return;
    }
    if (!pc.remoteDescription) {
      pendingCandidatesRef.current.push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      pendingCandidatesRef.current.push(candidate);
    }
  }, []);

  const unlockRemoteAudio = useCallback(async () => {
    const el = remoteAudioRef.current;
    if (!el) return;
    try {
      await el.play();
      setNeedsAudioUnlock(false);
    } catch (err) {
      console.error('Audio unlock failed:', err);
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      setTrackEnabled(localStreamRef.current, !next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (remoteStream && remoteAudioRef.current) {
      void attachRemoteAudio(remoteStream, remoteAudioRef.current).then((ok) => {
        if (!ok) setNeedsAudioUnlock(true);
      });
    }
  }, [remoteStream]);

  useEffect(() => {
    return () => {
      cleanupPeerConnection();
      stopMediaStream(localStreamRef.current);
    };
  }, [cleanupPeerConnection]);

  return {
    localStream,
    remoteStream,
    isMuted,
    isConnected,
    needsAudioUnlock,
    connectionQuality,
    initLocalStream,
    startCallAsInitiator,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    unlockRemoteAudio,
    toggleMute,
    endCall,
    remoteAudioRef,
  };
}
