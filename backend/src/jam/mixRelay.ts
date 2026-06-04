import { v4 as uuidv4 } from 'uuid';
import type { JamRoom, UserSession } from '../types';

const DEFAULT_REGIONS = ['us-east', 'us-west', 'eu-west'];

export class JamRelayManager {
  private rooms = new Map<string, JamRoom>();
  private queue: UserSession[] = [];
  private readonly maxParticipants: number;
  private readonly regions: string[];

  constructor(maxParticipants = 4, regions?: string[]) {
    this.maxParticipants = maxParticipants;
    this.regions = regions?.length ? regions : DEFAULT_REGIONS;
  }

  selectRegion(clientRegion?: string): string {
    if (clientRegion && this.regions.includes(clientRegion)) {
      return clientRegion;
    }
    return this.regions[0];
  }

  enqueue(session: UserSession): JamRoom | null {
    this.removeFromQueue(session.socketId);

    // Try to join an existing room in the same region with space
    const region = this.selectRegion(session.region);
    for (const room of this.rooms.values()) {
      if (room.region === region && room.participants.size < this.maxParticipants) {
        room.participants.set(session.socketId, {
          socketId: session.socketId,
          userId: session.userId,
          interests: session.interests,
        });
        session.currentRoomId = room.roomId;
        return room;
      }
    }

    this.queue.push(session);

    // Form a jam room when we have 2+ waiting in same region
    const sameRegion = this.queue.filter(
      (s) => this.selectRegion(s.region) === region
    );

    if (sameRegion.length >= 2) {
      const participants = sameRegion.slice(0, this.maxParticipants);
      participants.forEach((p) => this.removeFromQueue(p.socketId));

      const roomId = uuidv4();
      const room: JamRoom = {
        roomId,
        participants: new Map(),
        createdAt: Date.now(),
        region,
      };

      for (const p of participants) {
        room.participants.set(p.socketId, {
          socketId: p.socketId,
          userId: p.userId,
          interests: p.interests,
        });
        p.currentRoomId = roomId;
      }

      this.rooms.set(roomId, room);
      return room;
    }

    return null;
  }

  removeFromQueue(socketId: string): void {
    this.queue = this.queue.filter((s) => s.socketId !== socketId);
  }

  leaveRoom(socketId: string): JamRoom | null {
    for (const room of this.rooms.values()) {
      if (room.participants.has(socketId)) {
        room.participants.delete(socketId);
        if (room.participants.size === 0) {
          this.rooms.delete(room.roomId);
        }
        return room;
      }
    }
    return null;
  }

  getRoom(roomId: string): JamRoom | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Server-side timestamp for audio frame synchronization in Jam Mode.
   * Clients align local capture clocks to this reference.
   */
  getServerTimestamp(): number {
    return Date.now();
  }

  /**
   * Relay mixed-audio metadata between jam participants.
   * Actual audio mixing happens client-side with server clock sync;
   * server relays frame timestamps for alignment.
   */
  relayAudioFrame(
    roomId: string,
    fromSocketId: string,
    frame: { sequence: number; timestamp: number; payload: unknown }
  ): { roomId: string; from: string; frame: typeof frame; serverTime: number } | null {
    const room = this.rooms.get(roomId);
    if (!room || !room.participants.has(fromSocketId)) return null;

    return {
      roomId,
      from: fromSocketId,
      frame,
      serverTime: this.getServerTimestamp(),
    };
  }

  get queueSize(): number {
    return this.queue.length;
  }

  get activeRooms(): number {
    return this.rooms.size;
  }
}
