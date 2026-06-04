'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface UseAudioAnalyserOptions {
  stream: MediaStream | null;
  fftSize?: number;
  smoothing?: number;
}

interface AudioAnalyserResult {
  level: number;
  frequencyData: Uint8Array<ArrayBuffer> | null;
  isSpeaking: boolean;
}

export function useAudioAnalyser({
  stream,
  fftSize = 256,
  smoothing = 0.8,
}: UseAudioAnalyserOptions): AudioAnalyserResult {
  const [level, setLevel] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const frequencyDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (contextRef.current && contextRef.current.state !== 'closed') {
      contextRef.current.close().catch(() => {});
    }
    contextRef.current = null;
    analyserRef.current = null;
    frequencyDataRef.current = null;
  }, []);

  useEffect(() => {
    cleanup();

    if (!stream || stream.getAudioTracks().length === 0) {
      setLevel(0);
      setIsSpeaking(false);
      return;
    }

    const context = new AudioContext({ latencyHint: 'interactive' });
    const analyser = context.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = smoothing;

    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);

    contextRef.current = context;
    analyserRef.current = analyser;
    frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      if (!analyserRef.current || !frequencyDataRef.current) return;

      analyserRef.current.getByteFrequencyData(frequencyDataRef.current);

      let sum = 0;
      for (let i = 0; i < frequencyDataRef.current.length; i++) {
        sum += frequencyDataRef.current[i];
      }
      const avg = sum / frequencyDataRef.current.length / 255;
      setLevel(avg);
      setIsSpeaking(avg > 0.08);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return cleanup;
  }, [stream, fftSize, smoothing, cleanup]);

  return { level, frequencyData: frequencyDataRef.current, isSpeaking };
}
