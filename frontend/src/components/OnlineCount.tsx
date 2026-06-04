'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';

interface OnlineCountProps {
  count: number;
}

function OnlineCountComponent({ count }: OnlineCountProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 glass rounded-full px-4 py-2 text-sm"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <Users className="h-4 w-4 text-zinc-400" />
      <span className="text-zinc-300">
        <span className="font-semibold text-white">{count}</span> online
      </span>
    </motion.div>
  );
}

export const OnlineCount = memo(OnlineCountComponent);
