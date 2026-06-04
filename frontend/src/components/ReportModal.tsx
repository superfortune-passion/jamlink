'use client';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

const REPORT_REASONS = [
  'Inappropriate behavior',
  'Harassment',
  'Spam or bots',
  'Offensive language',
  'Other',
];

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string, details?: string) => void;
}

function ReportModalComponent({ isOpen, onClose, onSubmit }: ReportModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90%] max-w-md glass rounded-2xl p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-lg text-white">Report Peer</h3>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-white/10 text-zinc-400"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-zinc-400 mb-4">
              Your report is anonymous. The peer will be disconnected immediately.
            </p>
            <div className="space-y-2">
              {REPORT_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => {
                    onSubmit(reason);
                    onClose();
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl glass hover:bg-white/8 text-sm text-zinc-200 transition-colors"
                >
                  {reason}
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export const ReportModal = memo(ReportModalComponent);
