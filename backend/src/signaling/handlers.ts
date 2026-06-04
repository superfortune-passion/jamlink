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
          peer.currentPeerId = null;
          peer.currentRoomId = null;
        }
      }

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
      const peerId = session.currentPeerId;
      if (peerId && data.roomId === session.currentRoomId) {
        io.to(peerId).emit('offer', { roomId: data.roomId, sdp: data.sdp, from: socket.id });
      } else {
        console.warn('[signaling] offer dropped', { socketId: socket.id, peerId, roomId: data.roomId, sessionRoom: session.currentRoomId });
      }
    });

    socket.on('answer', (data: { roomId: string; sdp: SessionDescriptionInit }) => {
      const peerId = session.currentPeerId;
      if (peerId && data.roomId === session.currentRoomId) {
        io.to(peerId).emit('answer', { roomId: data.roomId, sdp: data.sdp, from: socket.id });
      } else {
        console.warn('[signaling] answer dropped', { socketId: socket.id, peerId, roomId: data.roomId, sessionRoom: session.currentRoomId });
      }
    });

    socket.on('ice-candidate', (data: { roomId: string; candidate: IceCandidateInit }) => {
      const peerId = session.currentPeerId;
      if (peerId && data.roomId === session.currentRoomId) {
        io.to(peerId).emit('ice-candidate', {
          roomId: data.roomId,
          candidate: data.candidate,
          from: socket.id,
        });
      }
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
      session.currentPeerId = null;
      session.currentRoomId = null;
    });

    socket.on('disconnect', () => {
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
