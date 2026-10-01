/**
 * commerce/voice/useAudioAnalyser.ts — Real-time Web Audio Analyser Hook
 *
 * Hooks Web Audio AnalyserNode to both local microphone and remote assistant streams.
 * Computes actual physical frequency spectrum and RMS decibel levels for real-time
 * voice bounce and fluid waveform deformation.
 */
import { useEffect, useRef, useState } from 'react';
import type { AudioFrequencyData, VoiceState } from './types';

const BAR_COUNT = 14;

export function useAudioAnalyser({
  localStream,
  remoteStream,
  audioElement,
  state,
}: {
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  audioElement?: HTMLAudioElement | null;
  state: VoiceState;
}): AudioFrequencyData {
  const [audioData, setAudioData] = useState<AudioFrequencyData>({
    volume: 0,
    bars: new Array(BAR_COUNT).fill(0.05),
    hasVoiceActivity: false,
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const localSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);

  const remoteSourceRef = useRef<MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);

  const animFrameRef = useRef<number | null>(null);
  const smoothedBarsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0.05));

  // Initialize or resume AudioContext
  useEffect(() => {
    if (state === 'idle') return;

    if (!audioCtxRef.current) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        audioCtxRef.current = new AudioCtxClass();
      }
    }

    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
  }, [state]);

  // Hook local microphone stream to analyser
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !localStream || localStream.getAudioTracks().length === 0) return;

    try {
      if (localSourceRef.current) {
        try { localSourceRef.current.disconnect(); } catch {}
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.75;
      localAnalyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(localStream);
      source.connect(analyser);
      localSourceRef.current = source;
    } catch (e) {
      console.warn('[useAudioAnalyser] Local audio attach error:', e);
    }

    return () => {
      if (localSourceRef.current) {
        try { localSourceRef.current.disconnect(); } catch {}
        localSourceRef.current = null;
      }
    };
  }, [localStream]);

  // Hook remote assistant stream to analyser
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    if (remoteStream && remoteStream.getAudioTracks().length > 0) {
      try {
        if (remoteSourceRef.current) {
          try { remoteSourceRef.current.disconnect(); } catch {}
        }
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.8;
        remoteAnalyserRef.current = analyser;

        const source = ctx.createMediaStreamSource(remoteStream);
        source.connect(analyser);
        remoteSourceRef.current = source;
      } catch (e) {
        console.warn('[useAudioAnalyser] Remote audio stream attach error:', e);
      }
    } else if (audioElement && !remoteSourceRef.current) {
      try {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.8;
        remoteAnalyserRef.current = analyser;

        const source = ctx.createMediaElementSource(audioElement);
        source.connect(analyser);
        source.connect(ctx.destination);
        remoteSourceRef.current = source;
      } catch (e) {
        // Element may already be connected or cross-origin
      }
    }

    return () => {
      if (remoteSourceRef.current) {
        try { remoteSourceRef.current.disconnect(); } catch {}
        remoteSourceRef.current = null;
      }
    };
  }, [remoteStream, audioElement]);

  // Real-time animation loop
  useEffect(() => {
    let active = true;

    const tick = () => {
      if (!active) return;

      let activeAnalyser: AnalyserNode | null = null;

      if (state === 'speaking') {
        activeAnalyser = remoteAnalyserRef.current;
      } else if (state === 'listening') {
        activeAnalyser = localAnalyserRef.current;
      }

      if (activeAnalyser && state !== 'idle') {
        const bufferLength = activeAnalyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        activeAnalyser.getByteFrequencyData(dataArray);

        // Calculate RMS volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalizedVol = Math.min(1, avg / 128);

        // Map frequency bins to visualizer bars
        const step = Math.max(1, Math.floor(bufferLength / BAR_COUNT));
        const newBars: number[] = [];

        for (let i = 0; i < BAR_COUNT; i++) {
          const rawVal = dataArray[i * step] || 0;
          const target = Math.min(1, Math.max(0.08, rawVal / 220));

          // Physical attack & decay smoothing
          const prev = smoothedBarsRef.current[i] || 0.08;
          const speed = target > prev ? 0.45 : 0.2; // Quick snap up, gentle float down
          const smoothed = prev + (target - prev) * speed;
          smoothedBarsRef.current[i] = smoothed;
          newBars.push(smoothed);
        }

        setAudioData({
          volume: normalizedVol,
          bars: newBars,
          hasVoiceActivity: normalizedVol > 0.05,
        });
      } else {
        // Resting idle state
        smoothedBarsRef.current = smoothedBarsRef.current.map(v => v + (0.08 - v) * 0.15);
        setAudioData({
          volume: 0,
          bars: [...smoothedBarsRef.current],
          hasVoiceActivity: false,
        });
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      active = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [state]);

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch {}
        audioCtxRef.current = null;
      }
    };
  }, []);

  return audioData;
}
