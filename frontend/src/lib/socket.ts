import { io, Socket } from 'socket.io-client';
import type { SignalingEvents } from '@/types';

const SIGNALING_URL =
  process.env.NEXT_PUBLIC_SIGNALING_URL ?? 'http://localhost:3001';

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(SIGNALING_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: false,
    });
  }
  return socketInstance;
}

export function connectSocket(): Socket {
  const socket = getSocket();
  if (!socket.connected) {
    socket.connect();
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socketInstance?.connected) {
    socketInstance.disconnect();
  }
}

export type TypedSocket = Socket<SignalingEvents, SignalingEvents>;

export async function fetchIceServers(): Promise<
  SignalingEvents['connected']['iceServers']
> {
  try {
    const res = await fetch(`${SIGNALING_URL}/api/ice-servers`);
    const data = await res.json();
    return data.iceServers ?? [];
  } catch {
    return [];
  }
}

export async function fetchOnlineCount(): Promise<number> {
  try {
    const res = await fetch(`${SIGNALING_URL}/api/stats`);
    const data = await res.json();
    return data.online ?? 0;
  } catch {
    return 0;
  }
}
