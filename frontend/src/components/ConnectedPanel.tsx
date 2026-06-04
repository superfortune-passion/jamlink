'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { getInterestTitle } from '@/lib/interests';

interface ConnectedPanelProps {
  sharedInterests: string[];
  isSpeaking: boolean;
  peerSpeaking: boolean;
  connectionQuality: string;
  durationSeconds: number;
  needsAudioUnlock?: boolean;
  onUnlockAudio?: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function ConnectedPanelComponent({
  sharedInterests,
  isSpeaking,
  peerSpeaking,
  connectionQuality,
  durationSeconds,
  needsAudioUnlock,
  onUnlockAudio,
}: ConnectedPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md mx-auto glass rounded-2xl p-4 sm:p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Connected with</p>
          <p className="font-display font-semibold text-lg text-white">Anonymous Musician</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-500">Duration</p>
          <p className="font-mono text-lg text-cyan-400">{formatDuration(durationSeconds)}</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <VoiceActivity label="You" active={isSpeaking} color="violet" />
        <VoiceActivity label="Peer" active={peerSpeaking} color="cyan" />
      </div>

      {sharedInterests.length > 0 && (
        <div>
          <p className="text-xs text-zinc-500 mb-2">Shared interests</p>
          <div className="flex flex-wrap gap-1.5">
            {sharedInterests.map((id) => (
              <span
                key={id}
                className="px-2.5 py-1 rounded-full text-xs bg-violet-500/20 text-violet-200 border border-violet-500/30"
              >
                {getInterestTitle(id)}
              </span>
            ))}
          </div>
        </div>
      )}

      {needsAudioUnlock && onUnlockAudio && (
        <button
          type="button"
          onClick={onUnlockAudio}
          className="w-full py-2.5 px-4 rounded-xl bg-cyan-600/30 border border-cyan-500/50 text-cyan-200 text-sm font-medium hover:bg-cyan-600/40 transition-colors animate-pulse"
        >
          🔊 Tap to enable peer audio
        </button>
      )}

      <p className="text-xs text-zinc-600 text-center">
        Connection:{' '}
        <span
          className={`capitalize ${
            connectionQuality === 'excellent'
              ? 'text-emerald-400'
              : connectionQuality === 'good'
                ? 'text-cyan-400'
                : connectionQuality === 'poor'
                  ? 'text-amber-400'
                  : 'text-zinc-500'
          }`}
        >
          {connectionQuality}
        </span>
        {connectionQuality === 'unknown' && (
          <span className="block text-zinc-600 mt-1">Waiting for audio link…</span>
        )}
      </p>
    </motion.div>
  );
}

function VoiceActivity({
  label,
  active,
  color,
}: {
  label: string;
  active: boolean;
  color: 'violet' | 'cyan';
}) {
  const bg = color === 'violet' ? 'bg-violet-500' : 'bg-cyan-500';

  return (
    <div className="flex-1 flex flex-col items-center gap-1">
      <div className="flex items-end gap-0.5 h-6">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className={`w-1 rounded-full ${bg}`}
            animate={{
              height: active ? [4, 12 + i * 4, 6] : 4,
              opacity: active ? 1 : 0.3,
            }}
            transition={{
              duration: 0.4,
              repeat: active ? Infinity : 0,
              delay: i * 0.1,
            }}
          />
        ))}
      </div>
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  );
}

export const ConnectedPanel = memo(ConnectedPanelComponent);
