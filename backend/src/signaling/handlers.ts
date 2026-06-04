import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { MatchQueue } from '../matchmaking/queue';
import { RateLimiter } from '../moderation/rateLimiter';
import { JamRelayManager } from '../jam/mixRelay';
import type { IceServerConfig, UserSession, SessionDescriptionInit, IceCandidateInit } from '../types';

interface SignalingDeps {
  io: Server;
  matchQueue: MatchQueue;
  jamManager: JamRelayManager;
  searchLimiter: RateLimiter;
  skipLimiter: RateLimiter;
  reportLimiter: RateLimiter;
  getIceServers: () => IceServerConfig[];
}

const sessions = new Map<string, UserSession>();

/** Reliable room → peer mapping for WebRTC signal relay */
const activeRooms = new Map<string, { peerA: string; peerB: string }>();

function registerRoom(roomId: string, peerA: string, peerB: string): void {
  activeRooms.set(roomId, { peerA, peerB });
}

function clearRoom(roomId: string | null): void {
  if (roomId) activeRooms.delete(roomId);
}

function joinSocketRoom(io: Server, socketId: string, roomId: string): void {
  const sock = io.sockets.sockets.get(socketId);
  sock?.join(roomId);
}

function leaveSocketRoom(io: Server, socketId: string, roomId: string): void {
  const sock = io.sockets.sockets.get(socketId);
  sock?.leave(roomId);
}

function relayToRoom(
  socket: Socket,
  roomId: string,
  event: 'offer' | 'answer' | 'ice-candidate',
  payload: Record<string, unknown>
): void {
  socket.to(roomId).emit(event, { ...payload, from: socket.id });
}

function getSession(socket: Socket): UserSession {
  let session = sessions.get(socket.id);
  if (!session) {
    session = {
      socketId: socket.id,
      userId: uuidv4(),
      interests: [],
      joinedAt: Date.now(),
      lastMatchedWith: new Set(),
      isSearching: false,
      currentPeerId: null,
      currentRoomId: null,
      mode: 'match',
    };
    sessions.set(socket.id, session);
  }
  return session;
}

function cleanupSession(socketId: string): void {
  sessions.delete(socketId);
}

function notifyPeerDisconnect(io: Server, peerSocketId: string, reason: string): void {
  io.to(peerSocketId).emit('peer-disconnected', { reason });
}

export function registerSignalingHandlers(deps: SignalingDeps): void {
  const { io, matchQueue, jamManager, searchLimiter, skipLimiter, reportLimiter, getIceServers } =
    deps;

  io.on('connection', (socket: Socket) => {
    const session = getSession(socket);

    socket.emit('connected', {
      userId: session.userId,
      iceServers: getIceServers(),
    });

    io.emit('presence-update', { online: io.engine.clientsCount });

    socket.on('update-interests', (data: { interests: string[] }) => {
      session.interests = Array.isArray(data.interests) ? data.interests.slice(0, 12) : [];
    });

    socket.on('search', (data?: { interests?: string[]; mode?: 'match' | 'jam'; region?: string }) => {
      if (!searchLimiter.isAllowed(session.userId)) {
        socket.emit('error', { code: 'RATE_LIMIT', message: 'Too many search requests. Please wait.' });
        return;
      }

      if (data?.interests) {
        session.interests = data.interests.slice(0, 12);
      }
      session.mode = data?.mode ?? 'match';
      session.region = data?.region;
      session.isSearching = true;

      socket.emit('searching', { interests: session.interests, mode: session.mode });

      if (session.mode === 'jam') {
        const room = jamManager.enqueue(session);
        if (room) {
          session.isSearching = false;
          session.currentRoomId = room.roomId;

          const participantList = Array.from(room.participants.values()).map((p) => ({
            socketId: p.socketId,
            userId: p.userId,
            interests: p.interests,
          }));

          for (const [sid] of room.participants) {
            io.to(sid).emit('jam-matched', {
              roomId: room.roomId,
              participants: participantList.filter((p) => p.socketId !== sid),
              sharedInterests: session.interests,
              region: room.region,
              serverTime: jamManager.getServerTimestamp(),
              initiator: participantList[0]?.socketId,
            });
          }
        }
        return;
      }

      matchQueue.add(session);
      const match = matchQueue.findMatch(session);

      if (match) {
        const peerA = sessions.get(match.peerA);
        const peerB = sessions.get(match.peerB);

        if (peerA && peerB) {
          peerA.isSearching = false;
          peerB.isSearching = false;
          peerA.currentPeerId = match.peerB;
          peerB.currentPeerId = match.peerA;
          peerA.currentRoomId = match.roomId;
          peerB.currentRoomId = match.roomId;
          registerRoom(match.roomId, match.peerA, match.peerB);
          joinSocketRoom(io, match.peerA, match.roomId);
          joinSocketRoom(io, match.peerB, match.roomId);

          const payloadA = {
            roomId: match.roomId,
            peerId: match.peerB,
            sharedInterests: match.sharedInterests,
            isInitiator: match.initiator === match.peerA,
          };

          const payloadB = {
            roomId: match.roomId,
            peerId: match.peerA,
            sharedInterests: match.sharedInterests,
            isInitiator: match.initiator === match.peerB,
          };

          io.to(match.peerA).emit('matched', payloadA);
          io.to(match.peerB).emit('matched', payloadB);
        }
      }
    });

    socket.on('cancel-search', () => {
      session.isSearching = false;
      matchQueue.remove(socket.id);
      jamManager.removeFromQueue(socket.id);
    });

    socket.on('skip', () => {
      if (!skipLimiter.isAllowed(session.userId)) {
        socket.emit('error', { code: 'RATE_LIMIT', message: 'Too many skips. Please wait.' });
        return;
      }

      const peerId = session.currentPeerId;
      if (peerId) {
        notifyPeerDisconnect(io, peerId, 'peer-skipped');
        const peer = sessions.get(peerId);
        if (peer) {
          if (session.currentRoomId) leaveSocketRoom(io, peerId, session.currentRoomId);
          clearRoom(session.currentRoomId);
          peer.currentPeerId = null;
          peer.currentRoomId = null;
        }
      }

      if (session.currentRoomId) leaveSocketRoom(io, socket.id, session.currentRoomId);
      clearRoom(session.currentRoomId);

      session.currentPeerId = null;
      session.currentRoomId = null;
      session.isSearching = false;

      socket.emit('searching', { interests: session.interests, mode: session.mode });
      matchQueue.add(session);
      const match = matchQueue.findMatch(session);

      if (match) {
        const peerA = sessions.get(match.peerA);
        const peerB = sessions.get(match.peerB);
        if (peerA && peerB) {
          peerA.isSearching = false;
          peerB.isSearching = false;
          peerA.currentPeerId = match.peerB;
          peerB.currentPeerId = match.peerA;
          peerA.currentRoomId = match.roomId;
          peerB.currentRoomId = match.roomId;
          registerRoom(match.roomId, match.peerA, match.peerB);
          joinSocketRoom(io, match.peerA, match.roomId);
          joinSocketRoom(io, match.peerB, match.roomId);

          io.to(match.peerA).emit('matched', {
            roomId: match.roomId,
            peerId: match.peerB,
            sharedInterests: match.sharedInterests,
            isInitiator: match.initiator === match.peerA,
          });
          io.to(match.peerB).emit('matched', {
            roomId: match.roomId,
            peerId: match.peerA,
            sharedInterests: match.sharedInterests,
            isInitiator: match.initiator === match.peerB,
          });
        }
      }
    });

    socket.on('offer', (data: { roomId: string; sdp: SessionDescriptionInit }) => {
      if (data.roomId !== session.currentRoomId) {
        console.warn('[signaling] offer dropped — wrong room', {
          socketId: socket.id,
          roomId: data.roomId,
        });
        return;
      }
      relayToRoom(socket, data.roomId, 'offer', { roomId: data.roomId, sdp: data.sdp });
    });

    socket.on('answer', (data: { roomId: string; sdp: SessionDescriptionInit }) => {
      if (data.roomId !== session.currentRoomId) {
        console.warn('[signaling] answer dropped — wrong room', {
          socketId: socket.id,
          roomId: data.roomId,
        });
        return;
      }
      relayToRoom(socket, data.roomId, 'answer', { roomId: data.roomId, sdp: data.sdp });
    });

    socket.on('ice-candidate', (data: { roomId: string; candidate: IceCandidateInit }) => {
      if (data.roomId !== session.currentRoomId) return;
      relayToRoom(socket, data.roomId, 'ice-candidate', {
        roomId: data.roomId,
        candidate: data.candidate,
      });
    });

    // Jam mode: mesh signaling
    socket.on('jam-offer', (data: { roomId: string; targetId: string; sdp: SessionDescriptionInit }) => {
      if (session.currentRoomId === data.roomId) {
        io.to(data.targetId).emit('jam-offer', { roomId: data.roomId, sdp: data.sdp, from: socket.id });
      }
    });

    socket.on('jam-answer', (data: { roomId: string; targetId: string; sdp: SessionDescriptionInit }) => {
      if (session.currentRoomId === data.roomId) {
        io.to(data.targetId).emit('jam-answer', { roomId: data.roomId, sdp: data.sdp, from: socket.id });
      }
    });

    socket.on('jam-ice-candidate', (data: { roomId: string; targetId: string; candidate: IceCandidateInit }) => {
      if (session.currentRoomId === data.roomId) {
        io.to(data.targetId).emit('jam-ice-candidate', {
          roomId: data.roomId,
          candidate: data.candidate,
          from: socket.id,
        });
      }
    });

    socket.on('jam-audio-frame', (data: { roomId: string; sequence: number; timestamp: number; payload: unknown }) => {
      const relay = jamManager.relayAudioFrame(data.roomId, socket.id, {
        sequence: data.sequence,
        timestamp: data.timestamp,
        payload: data.payload,
      });
      if (relay) {
        const room = jamManager.getRoom(data.roomId);
        if (room) {
          for (const [sid] of room.participants) {
            if (sid !== socket.id) {
              io.to(sid).emit('jam-audio-frame', relay);
            }
          }
        }
      }
    });

    socket.on('clock-sync', (data: { clientTime: number }) => {
      socket.emit('clock-sync-response', {
        clientTime: data.clientTime,
        serverTime: jamManager.getServerTimestamp(),
      });
    });

    socket.on('report', (data: { reason: string; details?: string }) => {
      if (!reportLimiter.isAllowed(session.userId)) {
        socket.emit('error', { code: 'RATE_LIMIT', message: 'Too many reports.' });
        return;
      }

      const peerId = session.currentPeerId;
      console.warn('[REPORT]', {
        reporter: session.userId,
        reportedPeer: peerId ? sessions.get(peerId)?.userId : 'unknown',
        reason: data.reason,
        details: data.details,
        timestamp: new Date().toISOString(),
      });

      socket.emit('report-received', { success: true });

      if (peerId) {
        notifyPeerDisconnect(io, peerId, 'reported');
        const peer = sessions.get(peerId);
        if (peer) {
          peer.currentPeerId = null;
          peer.currentRoomId = null;
        }
      }
      clearRoom(session.currentRoomId);
      session.currentPeerId = null;
      session.currentRoomId = null;
    });

    socket.on('disconnect', () => {
      if (session.currentRoomId) leaveSocketRoom(io, socket.id, session.currentRoomId);
      clearRoom(session.currentRoomId);
      matchQueue.remove(socket.id);
      jamManager.removeFromQueue(socket.id);

      const room = jamManager.leaveRoom(socket.id);
      if (room) {
        for (const [sid] of room.participants) {
          io.to(sid).emit('jam-participant-left', { socketId: socket.id, roomId: room.roomId });
        }
      }

      const peerId = session.currentPeerId;
      if (peerId) {
        notifyPeerDisconnect(io, peerId, 'peer-disconnected');
        const peer = sessions.get(peerId);
        if (peer) {
          peer.currentPeerId = null;
          peer.currentRoomId = null;
        }
      }

      cleanupSession(socket.id);
      io.emit('presence-update', { online: io.engine.clientsCount });
    });
  });
}

export function getActiveConnections(): number {
  return sessions.size;
}

export function getSearchingCount(matchQueue: MatchQueue): number {
  return matchQueue.searchingCount;
}
