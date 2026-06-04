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
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
}

interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isConnected: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'unknown';
  initLocalStream: () => Promise<MediaStream | null>;
  startCall: (isInitiator: boolean, roomId: string) => Promise<RTCSessionDescriptionInit | null>;
  handleOffer: (sdp: RTCSessionDescriptionInit, roomId: string) => Promise<RTCSessionDescriptionInit>;
  handleAnswer: (sdp: RTCSessionDescriptionInit) => Promise<void>;
  handleIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
  toggleMute: () => void;
  endCall: () => void;
  remoteAudioRef: React.RefObject<HTMLAudioElement>;
}

export function useWebRTC({ iceServers, onIceCandidate }: UseWebRTCOptions): UseWebRTCReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'poor' | 'unknown'>('unknown');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const roomIdRef = useRef<string | null>(null);
  const iceServersRef = useRef(iceServers);
  iceServersRef.current = iceServers;

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
    setRemoteStream(null);
    setIsConnected(false);
    setConnectionQuality('unknown');
  }, []);

  const endCall = useCallback(() => {
    cleanupPeerConnection();
    stopMediaStream(localStream);
    setLocalStream(null);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  }, [cleanupPeerConnection, localStream]);

  const initLocalStream = useCallback(async (): Promise<MediaStream | null> => {
    try {
      stopMediaStream(localStream);
      const stream = await getOptimizedAudioStream();
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('Microphone access denied:', err);
      return null;
    }
  }, [localStream]);

  const setupPeerConnection = useCallback(
    (stream: MediaStream) => {
      cleanupPeerConnection();

      const config = buildRtcConfig(iceServersRef.current);
      const pc = createPeerConnection(config);
      pcRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      pc.ontrack = (event) => {
        const [remote] = event.streams;
        if (remote) {
          setRemoteStream(remote);
          attachRemoteAudio(remote, remoteAudioRef.current);
          setIsConnected(true);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          onIceCandidate(event.candidate.toJSON());
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'connected') {
          setIsConnected(true);
        } else if (state === 'failed' || state === 'closed') {
          setIsConnected(false);
        }
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        if (state === 'connected' || state === 'completed') {
          setConnectionQuality('excellent');
        } else if (state === 'checking') {
          setConnectionQuality('good');
        } else if (state === 'disconnected' || state === 'failed') {
          setConnectionQuality('poor');
        }
      };

      return pc;
    },
    [onIceCandidate, cleanupPeerConnection]
  );

  const flushPendingCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;

    for (const candidate of pendingCandidatesRef.current) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // Ignore stale candidates
      }
    }
    pendingCandidatesRef.current = [];
  }, []);

  const startCall = useCallback(
    async (isInitiator: boolean, roomId: string): Promise<RTCSessionDescriptionInit | null> => {
      roomIdRef.current = roomId;
      const stream = localStream ?? (await initLocalStream());
      if (!stream) return null;

      const pc = setupPeerConnection(stream);

      if (isInitiator) {
        return createOffer(pc);
      }
      return null;
    },
    [localStream, initLocalStream, setupPeerConnection]
  );

  const handleOffer = useCallback(
    async (sdp: RTCSessionDescriptionInit, roomId: string): Promise<RTCSessionDescriptionInit> => {
      roomIdRef.current = roomId;
      const stream = localStream ?? (await initLocalStream());
      if (!stream) throw new Error('No local stream');

      // Always create a fresh PC when answering an offer
      const pc = setupPeerConnection(stream);

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await flushPendingCandidates();

      const answer = await createAnswer(pc);
      return answer;
    },
    [localStream, initLocalStream, setupPeerConnection, flushPendingCandidates]
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

  const handleIceCandidate = useCallback(
    async (candidate: RTCIceCandidateInit) => {
      const pc = pcRef.current;
      if (!pc || !pc.remoteDescription) {
        pendingCandidatesRef.current.push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        pendingCandidatesRef.current.push(candidate);
      }
    },
    []
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      setTrackEnabled(localStream, !next);
      return next;
    });
  }, [localStream]);

  useEffect(() => {
    return () => {
      cleanupPeerConnection();
      stopMediaStream(localStream);
    };
  }, [cleanupPeerConnection, localStream]);

  return {
    localStream,
    remoteStream,
    isMuted,
    isConnected,
    connectionQuality,
    initLocalStream,
    startCall,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    toggleMute,
    endCall,
    remoteAudioRef,
  };
}
