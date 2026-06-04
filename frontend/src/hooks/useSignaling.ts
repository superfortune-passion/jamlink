'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { connectSocket, getSocket, fetchIceServers } from '@/lib/socket';
import type { ConnectionState, IceServerConfig, MatchMode, MatchedPayload } from '@/types';

interface UseSignalingReturn {
  connectionState: ConnectionState;
  onlineCount: number;
  userId: string | null;
  sharedInterests: string[];
  peerId: string | null;
  roomId: string | null;
  isInitiator: boolean;
  error: string | null;
  mode: MatchMode;
  connect: () => void;
  search: (interests: string[], mode?: MatchMode) => void;
  cancelSearch: () => void;
  skip: () => void;
  report: (reason: string, details?: string) => void;
  sendOffer: (roomId: string, sdp: RTCSessionDescriptionInit) => void;
  sendAnswer: (roomId: string, sdp: RTCSessionDescriptionInit) => void;
  sendIceCandidate: (roomId: string, candidate: RTCIceCandidateInit) => void;
  onOffer: (cb: (data: { roomId: string; sdp: RTCSessionDescriptionInit; from: string }) => void) => void;
  onAnswer: (cb: (data: { roomId: string; sdp: RTCSessionDescriptionInit; from: string }) => void) => void;
  onIceCandidate: (cb: (data: { roomId: string; candidate: RTCIceCandidateInit; from: string }) => void) => void;
  onPeerDisconnected: (cb: (reason: string) => void) => void;
  onMatched: (cb: (data: MatchedPayload) => void) => void;
  iceServers: IceServerConfig[];
}

export function useSignaling(): UseSignalingReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [onlineCount, setOnlineCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [sharedInterests, setSharedInterests] = useState<string[]>([]);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isInitiator, setIsInitiator] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<MatchMode>('match');
  const [iceServers, setIceServers] = useState<IceServerConfig[]>([]);

  const offerCbRef = useRef<((data: { roomId: string; sdp: RTCSessionDescriptionInit; from: string }) => void) | null>(null);
  const answerCbRef = useRef<((data: { roomId: string; sdp: RTCSessionDescriptionInit; from: string }) => void) | null>(null);
  const iceCbRef = useRef<((data: { roomId: string; candidate: RTCIceCandidateInit; from: string }) => void) | null>(null);
  const disconnectCbRef = useRef<((reason: string) => void) | null>(null);
  const matchedCbRef = useRef<((data: MatchedPayload) => void) | null>(null);
  const listenersBoundRef = useRef(false);

  const connect = useCallback(() => {
    const socket = connectSocket();
    setConnectionState('connecting');

    if (listenersBoundRef.current) return;
    listenersBoundRef.current = true;

    socket.on('connect', () => setConnectionState('idle'));

    socket.on('connected', (data) => {
      setUserId(data.userId);
      if (data.iceServers?.length) setIceServers(data.iceServers);
    });

    socket.on('searching', (data) => {
      setConnectionState('searching');
      setMode(data.mode);
      setPeerId(null);
      setRoomId(null);
      setSharedInterests([]);
    });

    socket.on('matched', (data) => {
      setConnectionState('matched');
      setPeerId(data.peerId);
      setRoomId(data.roomId);
      setSharedInterests(data.sharedInterests);
      setIsInitiator(data.isInitiator);
      setMode('match');
      matchedCbRef.current?.(data);
    });

    socket.on('jam-matched', (data) => {
      setConnectionState('matched');
      setRoomId(data.roomId);
      setSharedInterests(data.sharedInterests);
      setMode('jam');
      setPeerId(data.participants[0]?.socketId ?? null);
      setIsInitiator(data.initiator === socket.id);
      matchedCbRef.current?.({
        roomId: data.roomId,
        peerId: data.participants[0]?.socketId ?? '',
        sharedInterests: data.sharedInterests,
        isInitiator: data.initiator === socket.id,
      });
    });

    socket.on('peer-disconnected', (data) => {
      disconnectCbRef.current?.(data.reason);
      setConnectionState('idle');
      setPeerId(null);
      setRoomId(null);
      setSharedInterests([]);
    });

    socket.on('offer', (data) => offerCbRef.current?.(data));
    socket.on('answer', (data) => answerCbRef.current?.(data));
    socket.on('ice-candidate', (data) => iceCbRef.current?.(data));

    socket.on('presence-update', (data) => setOnlineCount(data.online));

    socket.on('error', (data) => {
      setError(data.message);
      setTimeout(() => setError(null), 5000);
    });

    socket.on('disconnect', () => setConnectionState('reconnecting'));
    socket.io.on('reconnect', () => setConnectionState('idle'));
  }, []);

  useEffect(() => {
    fetchIceServers().then((servers) => {
      if (servers.length) setIceServers(servers);
    });
  }, []);

  const search = useCallback((interests: string[], searchMode: MatchMode = 'match') => {
    const socket = getSocket();
    setMode(searchMode);
    socket.emit('update-interests', { interests });
    socket.emit('search', { interests, mode: searchMode });
  }, []);

  const cancelSearch = useCallback(() => {
    getSocket().emit('cancel-search');
    setConnectionState('idle');
  }, []);

  const skip = useCallback(() => {
    getSocket().emit('skip');
    setConnectionState('searching');
  }, []);

  const report = useCallback((reason: string, details?: string) => {
    getSocket().emit('report', { reason, details });
    setConnectionState('idle');
    setPeerId(null);
    setRoomId(null);
  }, []);

  const sendOffer = useCallback((rid: string, sdp: RTCSessionDescriptionInit) => {
    getSocket().emit('offer', { roomId: rid, sdp });
  }, []);

  const sendAnswer = useCallback((rid: string, sdp: RTCSessionDescriptionInit) => {
    getSocket().emit('answer', { roomId: rid, sdp });
  }, []);

  const sendIceCandidate = useCallback((rid: string, candidate: RTCIceCandidateInit) => {
    getSocket().emit('ice-candidate', { roomId: rid, candidate });
  }, []);

  const onOffer = useCallback((cb: typeof offerCbRef.current) => {
    offerCbRef.current = cb;
  }, []);

  const onAnswer = useCallback((cb: typeof answerCbRef.current) => {
    answerCbRef.current = cb;
  }, []);

  const onIceCandidate = useCallback((cb: typeof iceCbRef.current) => {
    iceCbRef.current = cb;
  }, []);

  const onPeerDisconnected = useCallback((cb: typeof disconnectCbRef.current) => {
    disconnectCbRef.current = cb;
  }, []);

  const onMatched = useCallback((cb: typeof matchedCbRef.current) => {
    matchedCbRef.current = cb;
  }, []);

  return {
    connectionState,
    onlineCount,
    userId,
    sharedInterests,
    peerId,
    roomId,
    isInitiator,
    error,
    mode,
    connect,
    search,
    cancelSearch,
    skip,
    report,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    onOffer,
    onAnswer,
    onIceCandidate,
    onPeerDisconnected,
    onMatched,
    iceServers,
  };
}
