import { v4 as uuidv4 } from 'uuid';
import type { UserSession, MatchResult } from '../types';

function computeOverlap(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return a.filter((i) => setB.has(i));
}

function scoreMatch(a: UserSession, b: UserSession): number {
  const overlap = computeOverlap(a.interests, b.interests);
  let score = overlap.length * 10;

  // Priority tags boost
  const priorityTags = ['producer', 'songwriter', 'vocalist', 'guitarist'];
  for (const tag of overlap) {
    if (priorityTags.includes(tag)) score += 5;
  }

  // Penalize recent matches
  if (a.lastMatchedWith.has(b.userId)) score -= 100;
  if (b.lastMatchedWith.has(a.userId)) score -= 100;

  // Prefer similar mode
  if (a.mode === b.mode) score += 3;

  return score;
}

export class MatchQueue {
  private queue: UserSession[] = [];

  add(session: UserSession): void {
    if (!this.queue.find((s) => s.socketId === session.socketId)) {
      this.queue.push(session);
    }
  }

  remove(socketId: string): UserSession | undefined {
    const idx = this.queue.findIndex((s) => s.socketId === socketId);
    if (idx === -1) return undefined;
    return this.queue.splice(idx, 1)[0];
  }

  findMatch(session: UserSession): MatchResult | null {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < this.queue.length; i++) {
      const candidate = this.queue[i];
      if (candidate.socketId === session.socketId) continue;
      if (candidate.currentPeerId) continue;

      const score = scoreMatch(session, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) return null;

    const peer = this.queue.splice(bestIdx, 1)[0];
    this.remove(session.socketId);

    const sharedInterests = computeOverlap(session.interests, peer.interests);
    const roomId = uuidv4();

    // Alternate initiator based on join time
    const initiator = session.joinedAt <= peer.joinedAt ? session.socketId : peer.socketId;

    session.lastMatchedWith.add(peer.userId);
    peer.lastMatchedWith.add(session.userId);

    // Trim history to last 20 matches
    if (session.lastMatchedWith.size > 20) {
      const arr = Array.from(session.lastMatchedWith);
      session.lastMatchedWith = new Set(arr.slice(-20));
    }
    if (peer.lastMatchedWith.size > 20) {
      const arr = Array.from(peer.lastMatchedWith);
      peer.lastMatchedWith = new Set(arr.slice(-20));
    }

    return {
      roomId,
      peerA: session.socketId,
      peerB: peer.socketId,
      sharedInterests,
      initiator,
    };
  }

  get size(): number {
    return this.queue.length;
  }

  get searchingCount(): number {
    return this.queue.filter((s) => s.isSearching).length;
  }
}
