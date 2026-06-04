'use client';

import { memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { INTERESTS } from '@/lib/interests';

interface InterestGridProps {
  selected: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
}

function InterestGridComponent({ selected, onToggle, disabled }: InterestGridProps) {
  const handleToggle = useCallback(
    (id: string) => {
      if (!disabled) onToggle(id);
    },
    [disabled, onToggle]
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 w-full">
      {INTERESTS.map((interest, index) => {
        const isSelected = selected.includes(interest.id);
        return (
          <motion.button
            key={interest.id}
            type="button"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.02, duration: 0.3 }}
            whileHover={disabled ? {} : { scale: 1.02, y: -2 }}
            whileTap={disabled ? {} : { scale: 0.98 }}
            onClick={() => handleToggle(interest.id)}
            disabled={disabled}
            className={`
              relative flex flex-col items-center justify-center gap-1.5 p-3 sm:p-4 rounded-xl
              transition-colors duration-200 text-center min-h-[88px] sm:min-h-[96px]
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              ${
                isSelected
                  ? 'bg-gradient-to-br from-violet-600/30 to-cyan-600/20 border-violet-500/50 shadow-lg shadow-violet-500/20'
                  : 'glass hover:bg-white/6 border-transparent'
              }
              border
            `}
          >
            {isSelected && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center"
              >
                <Check className="w-3 h-3 text-white" strokeWidth={3} />
              </motion.div>
            )}
            <span className="text-2xl sm:text-3xl" role="img" aria-hidden>
              {interest.icon}
            </span>
            <span className="text-xs sm:text-sm font-medium text-zinc-200 leading-tight">
              {interest.title}
            </span>
            {interest.priority && (
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] uppercase tracking-wider text-violet-400/80 font-semibold">
                Popular
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

export const InterestGrid = memo(InterestGridComponent);

interface InterestPillsProps {
  selected: string[];
  onRemove: (id: string) => void;
}

function InterestPillsComponent({ selected, onRemove }: InterestPillsProps) {
  if (selected.length === 0) return null;

  return (
    <div className="w-full pills-scroll overflow-x-auto">
      <div className="flex flex-wrap gap-2 justify-center py-2">
        <AnimatePresence mode="popLayout">
          {selected.map((id) => {
            const interest = INTERESTS.find((i) => i.id === id);
            if (!interest) return null;
            return (
              <motion.button
                key={id}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => onRemove(id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-violet-600/40 to-cyan-600/30 border border-violet-500/30 text-sm text-zinc-100 hover:border-violet-400/50 transition-colors"
              >
                <span>{interest.icon}</span>
                <span>{interest.title}</span>
                <span className="text-zinc-400 ml-0.5">×</span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

export const InterestPills = memo(InterestPillsComponent);
