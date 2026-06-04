# JamLink

**JamLink** is a production-ready, musician-focused audio-only random matchmaking platform. Connect anonymously with guitarists, vocalists, producers, and artists worldwide for real-time voice collaboration and jamming — with minimal latency WebRTC audio.

## Features

- **WebRTC P2P audio** with STUN/TURN NAT traversal and DTLS-SRTP encryption
- **Interest-based matchmaking** with priority tags and repeat-match avoidance
- **One-page premium UX** — voice orb visualization, responsive interest grid, glassmorphism design
- **Full call controls** — mute, skip, end, report
- **Jam Mode** — multi-musician sessions with server clock sync and audio frame relay
- **Rate limiting & moderation** — abuse prevention on search, skip, and report actions

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Microphone access in browser (HTTPS required in production)

### 1. Backend (Signaling Server)

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Server runs at `http://localhost:3001`.

### 2. Frontend (Next.js)

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

App runs at `http://localhost:3000`.

### 3. Test Locally

1. Open two browser tabs to `http://localhost:3000`
2. Select interests and click **Start Matching** in both tabs
3. Allow microphone access when prompted
4. You should be matched and hear each other

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `CORS_ORIGIN` | Allowed frontend origins (comma-separated) | `http://localhost:3000` |
| `STUN_SERVERS` | Comma-separated STUN URLs | Google public STUN |
| `TURN_URL` | TURN server URL | — |
| `TURN_USERNAME` | TURN username | — |
| `TURN_CREDENTIAL` | TURN credential | — |
| `MAX_SEARCHES_PER_MINUTE` | Search rate limit | `10` |
| `MAX_SKIPS_PER_MINUTE` | Skip rate limit | `20` |
| `MAX_REPORTS_PER_HOUR` | Report rate limit | `5` |
| `JAM_MODE_MAX_PARTICIPANTS` | Max musicians per jam room | `4` |
| `JAM_RELAY_REGIONS` | Edge relay regions | `us-east,us-west,eu-west` |

### Frontend (`frontend/.env.local`)

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_SIGNALING_URL` | Backend signaling URL | `http://localhost:3001` |

## TURN/STUN Configuration

For production (especially when users are behind symmetric NAT or corporate firewalls), configure a TURN server:

```env
STUN_SERVERS=stun:stun.l.google.com:19302
TURN_URL=turn:your-turn.example.com:3478
TURN_USERNAME=your-username
TURN_CREDENTIAL=your-credential
```

Recommended TURN providers: [Twilio Network Traversal](https://www.twilio.com/stun-turn), [Metered.ca](https://www.metered.ca/tools/openrelay/), or self-hosted [coturn](https://github.com/coturn/coturn).

ICE servers are served to clients via:
- Socket `connected` event
- `GET /api/ice-servers` REST endpoint

## Interest Matching

Users select up to 12 interests from a responsive grid. The matchmaking engine:

1. Scores queue pairs by **shared interest overlap** (+10 per match)
2. Boosts **priority tags**: producer, songwriter, vocalist, guitarist (+5 each)
3. **Penalizes** users matched in the last 20 sessions (-100)
4. Prefers users in the same mode (match vs jam)

**Quick Match** skips interest filtering for fastest pairing.

## Jam Mode

Jam Mode groups 2–4 musicians in a regional relay room:

- Server provides **clock synchronization** (`clock-sync` / `clock-sync-response`)
- **Timestamped audio frames** relayed between participants (`jam-audio-frame`)
- **Mesh WebRTC** signaling via `jam-offer`, `jam-answer`, `jam-ice-candidate`
- Regional edge routing via `JAM_RELAY_REGIONS`

See [LOW_LATENCY_AUDIO.md](./LOW_LATENCY_AUDIO.md) for technical details.

## Deployment

### Frontend → Vercel

```bash
cd frontend
vercel deploy
```

Set `NEXT_PUBLIC_SIGNALING_URL` to your production backend URL.

### Backend → Railway / Render / Fly.io

```bash
cd backend
npm run build
npm start
```

Set `CORS_ORIGIN` to your Vercel domain (e.g. `https://jamlink.vercel.app`).

### Health Check

```
GET /health
GET /api/stats
```

## Project Structure

```
RePro/
├── backend/          # Node.js + Socket.IO signaling
│   └── src/
│       ├── index.ts
│       ├── matchmaking/
│       ├── signaling/
│       ├── jam/
│       └── moderation/
├── frontend/         # Next.js + React + Tailwind
│   └── src/
│       ├── app/
│       ├── components/
│       ├── hooks/
│       └── lib/
├── SYSTEM_ARCHITECTURE.md
└── LOW_LATENCY_AUDIO.md
```

## API Events (Socket.IO)

| Event | Direction | Description |
|-------|-----------|-------------|
| `search` | Client → Server | Enter matchmaking queue |
| `searching` | Server → Client | Actively searching |
| `matched` | Server → Client | 1:1 match found |
| `offer` / `answer` | Bidirectional | WebRTC SDP exchange |
| `ice-candidate` | Bidirectional | ICE candidate relay |
| `skip` | Client → Server | Skip current peer |
| `peer-disconnected` | Server → Client | Peer left |
| `report` | Client → Server | Report abusive peer |
| `presence-update` | Server → All | Online count update |

## Safety

- Anonymous peer labels (no PII exchanged)
- Report disconnects peer immediately
- Rate limits on search, skip, and report
- Server-side report logging for moderation review

## Documentation

- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) — diagrams and data flows
- [LOW_LATENCY_AUDIO.md](./LOW_LATENCY_AUDIO.md) — WebRTC, jitter buffers, audio optimizations

## License

MIT
