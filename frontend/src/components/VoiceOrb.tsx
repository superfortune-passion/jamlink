'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';

interface VoiceOrbProps {
  level: number;
  isActive: boolean;
  isSearching: boolean;
  isConnected: boolean;
}

function VoiceOrbComponent({ level, isActive, isSearching, isConnected }: VoiceOrbProps) {
  const scale = 1 + level * 0.35;
  const glowIntensity = 0.3 + level * 0.7;

  return (
    <div className="relative flex items-center justify-center w-32 h-32 sm:w-40 sm:h-40 shrink-0">
      {isSearching && (
        <>
          <motion.div
            className="absolute inset-0 rounded-full border border-violet-500/30"
            animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
          />
          <motion.div
            className="absolute inset-0 rounded-full border border-cyan-500/20"
            animate={{ scale: [1, 2.2], opacity: [0.4, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut', delay: 0.5 }}
          />
        </>
      )}

      <motion.div
        className="absolute inset-2 rounded-full blur-2xl"
        style={{
          background: isConnected
            ? `radial-gradient(circle, rgba(16, 185, 129, ${glowIntensity}) 0%, transparent 70%)`
            : `radial-gradient(circle, rgba(139, 92, 246, ${glowIntensity}) 0%, rgba(6, 182, 212, ${glowIntensity * 0.5}) 50%, transparent 70%)`,
        }}
        animate={{ scale }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      />

      <motion.div
        className="relative w-full h-full rounded-full glass gradient-border flex items-center justify-center overflow-hidden"
        animate={{ scale }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <div
          className="absolute inset-0 opacity-60"
          style={{
            background: `conic-gradient(from 0deg, rgba(139, 92, 246, ${0.2 + level * 0.5}), rgba(6, 182, 212, ${0.2 + level * 0.5}), rgba(236, 72, 153, ${0.2 + level * 0.3}), rgba(139, 92, 246, ${0.2 + level * 0.5}))`,
          }}
        />

        {/* Waveform bars */}
        <div className="relative flex items-end justify-center gap-1 h-12">
          {Array.from({ length: 7 }).map((_, i) => {
            const barLevel = Math.max(0.15, level * (0.6 + Math.sin(i * 1.2) * 0.4));
            return (
              <motion.div
                key={i}
                className="w-1 rounded-full bg-gradient-to-t from-violet-500 to-cyan-400"
                animate={{
                  height: isActive ? `${12 + barLevel * 36}px` : '8px',
                  opacity: isActive ? 0.9 : 0.4,
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              />
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

export const VoiceOrb = memo(VoiceOrbComponent);
