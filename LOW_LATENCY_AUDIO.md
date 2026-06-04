# Low-Latency Audio — JamLink Technical Guide

This document explains how JamLink achieves minimal-latency musician-to-musician audio, including WebRTC internals, browser optimizations, and Jam Mode synchronization.

## Target: <50ms One-Way Latency

For nearby peers on a direct P2P path, sub-50ms latency is achievable when:

1. **Direct UDP path** is established (no TURN relay)
2. **Opus codec** is selected with low-complexity settings (browser default for WebRTC)
3. **No unnecessary buffering** in the audio pipeline
4. **Interactive AudioContext** hint is used for local monitoring/visualization only

Actual latency depends on network RTT, NAT type, and device audio stack.

## WebRTC Stack

```
Application Layer     │  JamLink UI + Signaling
──────────────────────┼──────────────────────────
Signaling (Socket.IO) │  SDP Offer/Answer, ICE candidates
──────────────────────┼──────────────────────────
WebRTC API            │  RTCPeerConnection, MediaStream
──────────────────────┼──────────────────────────
DTLS                  │  Key exchange, SRTP key derivation
──────────────────────┼──────────────────────────
SRTP                  │  Encrypted audio RTP packets
──────────────────────┼──────────────────────────
ICE/STUN/TURN         │  NAT traversal, candidate gathering
──────────────────────┼──────────────────────────
UDP                   │  Transport
```

### DTLS-SRTP Encryption

WebRTC **mandates** encryption. All audio is encrypted via DTLS-SRTP:

- DTLS handshake establishes session keys
- SRTP encrypts each RTP packet (AES-128-CM + HMAC-SHA1)
- No configuration needed — enabled by default

## ICE, STUN, and TURN

### ICE (Interactive Connectivity Establishment)

ICE gathers **candidates** (possible connection paths):

| Type | Description | Latency |
|------|-------------|---------|
| `host` | Local network interface | Lowest |
| `srflx` | Server-reflexive (via STUN) | Low |
| `relay` | Relayed (via TURN) | Higher |

JamLink configures ICE via `RTCConfiguration.iceServers` from server environment.

### STUN

STUN discovers the client's public IP:port behind NAT. Required for most real-world connections. JamLink defaults to Google public STUN servers; production should use dedicated STUN.

### TURN

TURN relays media when direct P2P fails (symmetric NAT, strict firewalls). Adds latency but ensures connectivity. Configure via:

```env
TURN_URL=turn:turn.example.com:3478
TURN_USERNAME=user
TURN_CREDENTIAL=pass
```

## Browser Audio Optimizations

JamLink requests optimized capture constraints:

```typescript
{
  echoCancellation: true,    // Removes speaker→mic feedback
  noiseSuppression: true,    // Reduces background noise
  autoGainControl: true,     // Normalizes input volume
  channelCount: 1,           // Mono — lower bandwidth
  sampleRate: 48000,         // WebRTC native rate
  sampleSize: 16,
}
```

### Echo Cancellation (AEC)

Prevents the remote party's audio (played through speakers) from being re-captured by the microphone. Critical for jamming without headphones.

### Noise Suppression (NS)

Applies spectral subtraction to reduce HVAC, keyboard, and ambient noise. Trade-off: may affect subtle instrument harmonics at aggressive settings.

### Automatic Gain Control (AGC)

Normalizes input levels so quiet and loud musicians are balanced. JamLink also exposes client-side `GainNode` for manual adjustment.

### Voice Activity Detection (VAD)

Enabled in SDP offer (`voiceActivityDetection: true`). Reduces bandwidth during silence by limiting packet transmission.

## Jitter Buffer

The browser's WebRTC stack includes a **jitter buffer** that:

1. Receives RTP packets with variable inter-arrival times
2. Buffers packets to smooth playback timing
3. Plays out at consistent intervals

```
Packets arrive:  ●───●─●────●──●─●───●
                          ↓
Jitter buffer:   [████████████████]
                          ↓
Smooth playback: ████████████████████
```

**Trade-off:** Larger buffer = smoother audio but higher latency. WebRTC adapts buffer size dynamically based on network conditions. Application code does not directly control this — it's handled by the browser's `NetEq` (Chrome) equivalent.

## Packet Loss Compensation

When packets are lost on the network:

| Technique | Description |
|-----------|-------------|
| **PLC** (Packet Loss Concealment) | Opus decoder synthesizes plausible audio for missing frames |
| **NACK** | Receiver requests retransmission of lost packets |
| **FEC** | Forward error correction sends redundant data |
| **Adaptive bitrate** | Reduces encoding bitrate under congestion |

WebRTC's Opus codec provides excellent PLC for music and speech. Brief losses (<100ms) are often inaudible.

## Codec: Opus

WebRTC audio defaults to **Opus**:

- Frame sizes: 2.5ms to 60ms (browser selects adaptively)
- Bitrate: 6–510 kbps
- Full-band audio support (important for instruments)
- Built-in FEC and DTX (discontinuous transmission)

For musician collaboration, Opus at 48kHz full-band preserves harmonic content better than narrow-band speech codecs.

## JamLink Audio Pipeline

```
┌─────────────┐
│ Microphone  │
└──────┬──────┘
       │ getUserMedia (AEC/NS/AGC)
       ▼
┌─────────────┐     ┌──────────────────┐
│ MediaStream │────►│ RTCPeerConnection│──► SRTP/UDP ──► Peer
└──────┬──────┘     └──────────────────┘
       │
       ▼ (visualization only)
┌─────────────┐
│  Analyser   │──► Voice Orb / VAD indicator
│ AudioContext│    (latencyHint: 'interactive')
└─────────────┘
```

The AnalyserNode path is **not** in the WebRTC send path — it only reads levels for UI, avoiding added latency to the media stream.

## Jam Mode: Clock Synchronization

Multi-musician jam sessions require aligned timing:

```
Server Time (reference)
        │
        ├──► clock-sync-response { serverTime, clientTime }
        │
        ▼
Client offset = serverTime - clientTime - (RTT/2)
        │
        ▼
Timestamped audio frames aligned to server clock
```

### Frame Relay

```typescript
// Client sends
jam-audio-frame { sequence, timestamp, payload }

// Server relays with serverTime
{ roomId, from, frame, serverTime }
```

Participants use `serverTime` to align local playback buffers, reducing perceived desync in multi-peer sessions.

### Regional Edge Relays

`JAM_RELAY_REGIONS` routes users to the nearest relay:

- `us-east`, `us-west`, `eu-west`
- Reduces signaling RTT and frame relay latency
- At scale, deploy backend instances per region

## Latency Budget (Typical)

| Stage | Latency |
|-------|---------|
| Audio capture buffer | 5–10ms |
| Encoding (Opus) | 5–20ms |
| Network (LAN) | 1–5ms |
| Network (same region) | 10–30ms |
| Jitter buffer | 20–60ms |
| Decoding | 5–10ms |
| Audio output buffer | 5–10ms |
| **Total (nearby P2P)** | **~40–80ms** |

TURN relay adds 30–100ms depending on server location.

## Best Practices for Musicians

1. **Use wired ethernet** when possible
2. **Headphones** prevent echo even with AEC enabled
3. **Close bandwidth-heavy apps** during sessions
4. **Same-region matching** reduces RTT (future: geo-aware queue)
5. **Configure TURN** for reliable connectivity behind strict NAT

## Monitoring Connection Quality

JamLink tracks `RTCPeerConnection.iceConnectionState`:

| State | UI Indicator |
|-------|-------------|
| `connected` / `completed` | Excellent |
| `checking` | Good |
| `disconnected` / `failed` | Poor |

Future enhancement: expose `getStats()` RTT and packet loss metrics in the connected panel.

## References

- [WebRTC 1.0 Specification](https://www.w3.org/TR/webrtc/)
- [RFC 8825 — WebRTC Overview](https://datatracker.ietf.org/doc/html/rfc8825)
- [RFC 6716 — Opus Codec](https://datatracker.ietf.org/doc/html/rfc6716)
- [MDN RTCPeerConnection](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection)
