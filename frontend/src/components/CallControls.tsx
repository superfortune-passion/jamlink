'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, SkipForward, PhoneOff, Flag } from 'lucide-react';

interface CallControlsProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onSkip: () => void;
  onEnd: () => void;
  onReport: () => void;
  disabled?: boolean;
}

function CallControlsComponent({
  isMuted,
  onToggleMute,
  onSkip,
  onEnd,
  onReport,
  disabled,
}: CallControlsProps) {
  return (
    <div className="flex items-center justify-center gap-3 sm:gap-4">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onToggleMute}
        disabled={disabled}
        className={`flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full glass transition-colors ${
          isMuted ? 'bg-amber-500/20 text-amber-400' : 'hover:bg-white/10 text-zinc-200'
        }`}
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onSkip}
        disabled={disabled}
        className="flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full glass hover:bg-violet-500/20 text-violet-300 transition-colors"
        aria-label="Skip to next"
      >
        <SkipForward className="w-5 h-5" />
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onEnd}
        disabled={disabled}
        className="flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-500/80 hover:bg-red-500 text-white shadow-lg shadow-red-500/30 transition-colors"
        aria-label="End call"
      >
        <PhoneOff className="w-6 h-6" />
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onReport}
        disabled={disabled}
        className="flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full glass hover:bg-orange-500/20 text-orange-400 transition-colors"
        aria-label="Report peer"
      >
        <Flag className="w-5 h-5" />
      </motion.button>
    </div>
  );
}

export const CallControls = memo(CallControlsComponent);
