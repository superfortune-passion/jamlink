import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { MatchQueue } from './matchmaking/queue';
import { JamRelayManager } from './jam/mixRelay';
import { RateLimiter } from './moderation/rateLimiter';
import {
  registerSignalingHandlers,
  getActiveConnections,
  getSearchingCount,
} from './signaling/handlers';
import type { IceServerConfig } from './types';

dotenv.config();

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000';

function parseIceServers(): IceServerConfig[] {
  const servers: IceServerConfig[] = [];

  const stunRaw = process.env.STUN_SERVERS ?? 'stun:stun.l.google.com:19302';
  stunRaw.split(',').forEach((url) => {
    const trimmed = url.trim();
    if (trimmed) servers.push({ urls: trimmed });
  });

  const turnUrls = process.env.TURN_URL?.trim();
  if (turnUrls) {
    turnUrls.split(',').forEach((url) => {
      const trimmed = url.trim();
      if (trimmed) {
        servers.push({
          urls: trimmed,
          username: process.env.TURN_USERNAME,
          credential: process.env.TURN_CREDENTIAL,
        });
      }
    });
  }

  return servers;
}

const app = express();
app.use(cors({ origin: CORS_ORIGIN.split(','), credentials: true }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN.split(','),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  transports: ['websocket', 'polling'],
});

const matchQueue = new MatchQueue();
const jamManager = new JamRelayManager(
  parseInt(process.env.JAM_MODE_MAX_PARTICIPANTS ?? '4', 10),
  process.env.JAM_RELAY_REGIONS?.split(',').map((r) => r.trim())
);

const searchLimiter = new RateLimiter(
  parseInt(process.env.MAX_SEARCHES_PER_MINUTE ?? '10', 10),
  60_000
);
const skipLimiter = new RateLimiter(
  parseInt(process.env.MAX_SKIPS_PER_MINUTE ?? '20', 10),
  60_000
);
const reportLimiter = new RateLimiter(
  parseInt(process.env.MAX_REPORTS_PER_HOUR ?? '5', 10),
  3_600_000
);

registerSignalingHandlers({
  io,
  matchQueue,
  jamManager,
  searchLimiter,
  skipLimiter,
  reportLimiter,
  getIceServers: parseIceServers,
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    connections: getActiveConnections(),
    searching: getSearchingCount(matchQueue),
    jamQueue: jamManager.queueSize,
    jamRooms: jamManager.activeRooms,
  });
});

app.get('/api/ice-servers', (_req, res) => {
  res.json({ iceServers: parseIceServers() });
});

app.get('/api/stats', (_req, res) => {
  res.json({
    online: io.engine.clientsCount,
    searching: getSearchingCount(matchQueue),
    activeConnections: getActiveConnections(),
    jamRooms: jamManager.activeRooms,
  });
});

// Periodic cleanup
setInterval(() => {
  searchLimiter.cleanup();
  skipLimiter.cleanup();
  reportLimiter.cleanup();
}, 300_000);

httpServer.listen(PORT, () => {
  console.log(`JamLink signaling server running on port ${PORT}`);
  console.log(`CORS origin: ${CORS_ORIGIN}`);
});

export { app, io, httpServer };
