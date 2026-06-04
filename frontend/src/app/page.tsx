'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Music2, Loader2 } from 'lucide-react';
import { VoiceOrb } from '@/components/VoiceOrb';
import { InterestGrid, InterestPills } from '@/components/InterestGrid';
import { OnlineCount } from '@/components/OnlineCount';
import { CallControls } from '@/components/CallControls';
import { ConnectedPanel } from '@/components/ConnectedPanel';
import { ReportModal } from '@/components/ReportModal';
import { useSignaling } from '@/hooks/useSignaling';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useAudioAnalyser } from '@/hooks/useAudioAnalyser';
import { fetchOnlineCount, fetchIceServers } from '@/lib/socket';

export default function HomePage() {
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [micReady, setMicReady] = useState(false);
  const [isRetryingAudio, setIsRetryingAudio] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initializedRef = useRef(false);
  const roomIdRef = useRef<string | null>(null);
  const isInitiatorRef = useRef(false);
  const retryCountRef = useRef(0);
  const offerCountRef = useRef(0);

  const signaling = useSignaling();
  const {
    connectionState,
    onlineCount,
    sharedInterests,
    roomId,
    isInitiator,
    error,
    connect,
    search,
    cancelSearch,
    skip,
    report,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    onOffer,
    onAnswer,
    onIceCandidate,
    onPeerDisconnected,
    onMatched,
    iceServers,
  } = signaling;

  const handleIceCandidate = useCallback(
    (roomId: string, candidate: RTCIceCandidateInit) => {
      sendIceCandidate(roomId, candidate);
    },
    [sendIceCandidate]
  );

  const webrtc = useWebRTC({
    iceServers,
    onIceCandidate: handleIceCandidate,
  });

  const webrtcRef = useRef(webrtc);
  webrtcRef.current = webrtc;

  const { level, isSpeaking } = useAudioAnalyser({ stream: webrtc.localStream });
  const { isSpeaking: peerSpeaking } = useAudioAnalyser({ stream: webrtc.remoteStream });

  const isSearching = connectionState === 'searching';
  const isConnected = connectionState === 'matched' && webrtc.isConnected;
  const showConnectedUI = connectionState === 'matched';

  const sendOfferRef = useRef(sendOffer);
  const sendAnswerRef = useRef(sendAnswer);
  sendOfferRef.current = sendOffer;
  sendAnswerRef.current = sendAnswer;

  const retryAudioConnection = useCallback(async () => {
    const rid = roomIdRef.current;
    if (!rid || !isInitiatorRef.current) return;
    setIsRetryingAudio(true);
    try {
      const forceRelay = retryCountRef.current >= 1;
      offerCountRef.current += 1;
      const offer = await webrtcRef.current.startCallAsInitiator(rid, forceRelay);
      if (offer) sendOfferRef.current(rid, offer);
    } finally {
      setIsRetryingAudio(false);
    }
  }, []);

  // WebRTC signaling handlers — register BEFORE connect()
  useEffect(() => {
    onMatched(async (data) => {
      roomIdRef.current = data.roomId;
      isInitiatorRef.current = data.isInitiator;
      retryCountRef.current = 0;
      offerCountRef.current = 0;

      if (data.isInitiator) {
        offerCountRef.current = 1;
        const offer = await webrtcRef.current.startCallAsInitiator(data.roomId);
        if (offer) sendOfferRef.current(data.roomId, offer);
      }
    });

    onOffer(async (data) => {
      roomIdRef.current = data.roomId;
      offerCountRef.current += 1;
      const forceRelay = offerCountRef.current >= 2;
      try {
        const answer = await webrtcRef.current.handleOffer(data.sdp, data.roomId, forceRelay);
        sendAnswerRef.current(data.roomId, answer);
      } catch (err) {
        console.error('Failed to handle offer:', err);
      }
    });

    onAnswer(async (data) => {
      await webrtcRef.current.handleAnswer(data.sdp);
    });

    onIceCandidate(async (data) => {
      await webrtcRef.current.handleIceCandidate(data.candidate);
    });

    onPeerDisconnected(() => {
      webrtcRef.current.endCall();
      roomIdRef.current = null;
      retryCountRef.current = 0;
      setCallDuration(0);
      if (timerRef.current) clearInterval(timerRef.current);
    });
  }, [onMatched, onOffer, onAnswer, onIceCandidate, onPeerDisconnected]);

  // Initialize socket after handlers are registered
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      connect();
      fetchIceServers();
      fetchOnlineCount();
    }
  }, [connect]);

  // Auto-retry audio when stuck on Unknown (initiator only, max 3 times)
  useEffect(() => {
    if (connectionState !== 'matched') return;
    if (webrtc.connectionQuality !== 'unknown') return;

    const timer = setInterval(() => {
      if (webrtcRef.current.connectionQuality !== 'unknown') return;
      if (!isInitiatorRef.current || !roomIdRef.current) return;
      if (retryCountRef.current >= 3) return;
      retryCountRef.current += 1;
      void retryAudioConnection();
    }, 7000);

    return () => clearInterval(timer);
  }, [connectionState, webrtc.connectionQuality, retryAudioConnection]);

  // Call duration timer — runs once matched (even while ICE is still connecting)
  useEffect(() => {
    if (connectionState === 'matched') {
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [connectionState]);

  const toggleInterest = useCallback((id: string) => {
    setSelectedInterests((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }, []);

  const handleStartMatching = useCallback(async () => {
    await fetchIceServers();
    const stream = await webrtc.initLocalStream();
    if (!stream) {
      alert('Microphone access is required. Click the lock icon in the address bar and allow the microphone.');
      return;
    }
    setMicReady(true);
    search(selectedInterests, 'match');
  }, [selectedInterests, search, webrtc]);

  const handleQuickMatch = useCallback(async () => {
    await fetchIceServers();
    const stream = await webrtc.initLocalStream();
    if (!stream) {
      alert('Microphone access is required. Click the lock icon in the address bar and allow the microphone.');
      return;
    }
    setMicReady(true);
    search([], 'match');
  }, [search, webrtc]);

  const handleJamMode = useCallback(async () => {
    const stream = await webrtc.initLocalStream();
    if (!stream) {
      alert('Microphone access is required for Jam Mode.');
      return;
    }
    setMicReady(true);
    search(selectedInterests, 'jam');
  }, [selectedInterests, search, webrtc]);

  const handleSkip = useCallback(() => {
    webrtc.endCall();
    setCallDuration(0);
    skip();
  }, [webrtc, skip]);

  const handleEnd = useCallback(() => {
    webrtc.endCall();
    setCallDuration(0);
    cancelSearch();
  }, [webrtc, cancelSearch]);

  const handleReport = useCallback(
    (reason: string, details?: string) => {
      webrtc.endCall();
      setCallDuration(0);
      report(reason, details);
    },
    [webrtc, report]
  );

  const ctaLabel = useMemo(() => {
    if (isSearching) return 'Searching...';
    if (selectedInterests.length === 0) return 'Start Matching — Pick Interests';
    if (selectedInterests.length === 1) return 'Start Matching — 1 Interest';
    return `Start Matching — ${selectedInterests.length} Interests`;
  }, [isSearching, selectedInterests.length]);

  const statusText = useMemo(() => {
    switch (connectionState) {
      case 'connecting':
        return 'Connecting to server...';
      case 'searching':
        return 'Finding a musician near you...';
      case 'matched':
        return webrtc.isConnected
          ? 'Connected — Jam away!'
          : 'Establishing audio connection...';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'error':
        return 'Connection error';
      default:
        return 'Select your interests and start matching';
    }
  }, [connectionState, webrtc.isConnected]);

  return (
    <main className="h-[100dvh] w-full overflow-hidden relative flex flex-col">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#0a0a0f]" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-pink-600/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 shrink-0">
        <div className="flex items-center gap-2">
          <Music2 className="w-6 h-6 text-violet-400" />
          <span className="font-display font-bold text-xl gradient-text">JamLink</span>
        </div>
        <OnlineCount count={onlineCount} />
      </header>

      {/* Main content — scrollable on small screens */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 pb-4">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-4 sm:gap-6 min-h-full">
          {/* Hero voice orb */}
          <div className="flex flex-col items-center gap-3 pt-2">
            <VoiceOrb
              level={level}
              isActive={micReady || isConnected}
              isSearching={isSearching}
              isConnected={webrtc.isConnected}
            />
            <motion.p
              key={statusText}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm sm:text-base text-zinc-400 text-center max-w-xs"
            >
              {statusText}
            </motion.p>
          </div>

          {/* Connected state */}
          <AnimatePresence>
            {showConnectedUI && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full"
              >
                <ConnectedPanel
                  sharedInterests={sharedInterests}
                  isSpeaking={isSpeaking}
                  peerSpeaking={peerSpeaking}
                  connectionQuality={webrtc.connectionQuality}
                  durationSeconds={callDuration}
                  needsAudioUnlock={webrtc.needsAudioUnlock}
                  onUnlockAudio={webrtc.unlockRemoteAudio}
                  onRetryAudio={isInitiator ? retryAudioConnection : undefined}
                  isRetrying={isRetryingAudio}
                />
                <div className="mt-4">
                  <CallControls
                    isMuted={webrtc.isMuted}
                    onToggleMute={webrtc.toggleMute}
                    onSkip={handleSkip}
                    onEnd={handleEnd}
                    onReport={() => setShowReportModal(true)}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Interest selection — hidden during active call */}
          {!showConnectedUI && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full space-y-4"
            >
              <div className="text-center">
                <h1 className="font-display font-bold text-2xl sm:text-3xl text-white mb-1">
                  Find Your Musical Match
                </h1>
                <p className="text-sm text-zinc-500">
                  Connect anonymously with musicians worldwide
                </p>
              </div>

              <InterestGrid
                selected={selectedInterests}
                onToggle={toggleInterest}
                disabled={isSearching}
              />

              <InterestPills
                selected={selectedInterests}
                onRemove={toggleInterest}
              />

              {/* CTA buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <motion.button
                  whileHover={{ scale: isSearching ? 1 : 1.02 }}
                  whileTap={{ scale: isSearching ? 1 : 0.98 }}
                  onClick={isSearching ? cancelSearch : handleStartMatching}
                  disabled={connectionState === 'connecting'}
                  className={`
                    flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm sm:text-base
                    transition-all duration-200
                    ${
                      isSearching
                        ? 'glass text-zinc-300 hover:bg-white/10'
                        : 'bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40'
                    }
                  `}
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cancel Search
                    </>
                  ) : (
                    ctaLabel
                  )}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleQuickMatch}
                  disabled={isSearching || connectionState === 'connecting'}
                  className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm sm:text-base glass text-zinc-200 hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                  <Zap className="w-4 h-4 text-amber-400" />
                  Quick Match
                </motion.button>
              </div>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={handleJamMode}
                disabled={isSearching || connectionState === 'connecting'}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm glass border border-violet-500/20 text-violet-300 hover:bg-violet-500/10 transition-colors disabled:opacity-50"
              >
                <Music2 className="w-4 h-4" />
                Jam Mode — Multi-musician session
              </motion.button>
            </motion.div>
          )}
        </div>
      </div>

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl bg-red-500/90 text-white text-sm shadow-lg z-50"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden remote audio element */}
      <audio ref={webrtc.remoteAudioRef} autoPlay playsInline className="hidden" />

      <ReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSubmit={handleReport}
      />
    </main>
  );
}
