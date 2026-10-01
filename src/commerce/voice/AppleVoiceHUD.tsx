/**
 * commerce/voice/AppleVoiceHUD.tsx — Ultra-Luxury 2026/2027 Siri / Apple Intelligence Voice Visualizer
 *
 * Replaces outdated analog frequency bars with:
 * - 60 FPS Fluid Harmonic Sine Wave Canvas with organic phase drifting & bloom
 * - Liquid Aurora chromatic refraction (cyan/emerald for listening, magenta/amber/violet for assistant)
 * - Multi-layer pulsating quantum acoustic core
 * - Ultra-sleek obsidian glass capsule with dynamic specular lighting
 */
import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, PhoneOff, Sparkles, Loader2 } from 'lucide-react';
import type { AudioFrequencyData, VoiceState } from './types';

export interface AppleVoiceHUDProps {
  state: VoiceState;
  audioData: AudioFrequencyData;
  onToggle: () => void;
  className?: string;
}

export function AppleVoiceHUD({
  state,
  audioData,
  onToggle,
  className = '',
}: AppleVoiceHUDProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<number>(0);
  const animIdRef = useRef<number | null>(null);

  const isConnected = state === 'listening' || state === 'speaking';
  const isConnecting = state === 'connecting';
  const isSpeaking = state === 'speaking';
  const isListening = state === 'listening';
  const isIdle = state === 'idle';

  // Real-time canvas fluid harmonic wave rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let localPhase = phaseRef.current;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // Phase progression speed depends on activity
      const speed = isSpeaking ? 0.08 : isListening ? 0.05 : 0.02;
      localPhase += speed;
      phaseRef.current = localPhase;

      const midY = height / 2;
      const volumeBoost = Math.max(0.12, Math.min(1.0, audioData.volume * 2.2));

      // Define multi-layered harmonic wave ribbons
      interface WaveConfig {
        freq: number;
        ampMultiplier: number;
        color: string;
        glow: string;
        lineWidth: number;
        phaseOffset: number;
      }

      let waves: WaveConfig[] = [];

      if (isSpeaking) {
        // Chromatic Siri / Apple Intelligence Liquid Palette
        waves = [
          { freq: 0.038, ampMultiplier: 1.1, color: 'rgba(236, 72, 153, 0.85)', glow: 'rgba(236, 72, 153, 0.8)', lineWidth: 2.2, phaseOffset: 0 },
          { freq: 0.052, ampMultiplier: 0.85, color: 'rgba(168, 85, 247, 0.85)', glow: 'rgba(168, 85, 247, 0.7)', lineWidth: 1.8, phaseOffset: Math.PI / 3 },
          { freq: 0.065, ampMultiplier: 0.65, color: 'rgba(251, 146, 60, 0.85)', glow: 'rgba(251, 146, 60, 0.6)', lineWidth: 1.5, phaseOffset: Math.PI * 0.8 },
          { freq: 0.032, ampMultiplier: 0.45, color: 'rgba(56, 189, 248, 0.75)', glow: 'rgba(56, 189, 248, 0.5)', lineWidth: 1.2, phaseOffset: Math.PI * 1.2 },
        ];
      } else if (isListening) {
        // Electric Cyan & Emerald Responsive User Speech Waves
        waves = [
          { freq: 0.045, ampMultiplier: 1.0, color: 'rgba(52, 211, 153, 0.9)', glow: 'rgba(52, 211, 153, 0.75)', lineWidth: 2.2, phaseOffset: 0 },
          { freq: 0.062, ampMultiplier: 0.8, color: 'rgba(45, 212, 191, 0.85)', glow: 'rgba(45, 212, 191, 0.65)', lineWidth: 1.8, phaseOffset: Math.PI / 2 },
          { freq: 0.035, ampMultiplier: 0.5, color: 'rgba(56, 189, 248, 0.75)', glow: 'rgba(56, 189, 248, 0.5)', lineWidth: 1.4, phaseOffset: Math.PI },
        ];
      } else if (isConnecting) {
        // Warm Amber Pulsing Waves
        waves = [
          { freq: 0.04, ampMultiplier: 0.5, color: 'rgba(251, 191, 36, 0.85)', glow: 'rgba(251, 191, 36, 0.6)', lineWidth: 1.8, phaseOffset: localPhase },
        ];
      } else {
        // Idle gentle breathing baseline wave
        waves = [
          { freq: 0.025, ampMultiplier: 0.22, color: 'rgba(255, 255, 255, 0.25)', glow: 'rgba(255, 255, 255, 0.1)', lineWidth: 1.2, phaseOffset: 0 },
        ];
      }

      // Draw each harmonic wave ribbon
      waves.forEach(w => {
        ctx.beginPath();
        ctx.lineWidth = w.lineWidth;
        ctx.strokeStyle = w.color;
        ctx.shadowColor = w.glow;
        ctx.shadowBlur = isConnected ? 8 : 2;

        const baseAmp = (height * 0.38) * (isConnected ? volumeBoost : 0.25) * w.ampMultiplier;

        for (let x = 0; x <= width; x += 2) {
          // Window envelope so edges taper smoothly to 0 at the capsule borders
          const envelope = Math.sin((x / width) * Math.PI);
          const y = midY + Math.sin(x * w.freq + localPhase + w.phaseOffset) * baseAmp * envelope;

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      });

      ctx.restore();
      animIdRef.current = requestAnimationFrame(render);
    };

    animIdRef.current = requestAnimationFrame(render);

    return () => {
      if (animIdRef.current) cancelAnimationFrame(animIdRef.current);
    };
  }, [state, audioData, isConnected, isSpeaking, isListening, isConnecting]);

  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`}>
      {/* ── 2026/2027 LIQUID AURORA BACKDROP REFRACTION ── */}
      <AnimatePresence>
        {isConnected && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: isSpeaking ? 0.75 : 0.45,
              scale: isSpeaking ? [1, 1.06 + audioData.volume * 0.18, 1] : 1,
            }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className={`absolute -inset-1 rounded-full blur-xl pointer-events-none transition-colors duration-500 ${
              isSpeaking
                ? 'bg-gradient-to-r from-fuchsia-600 via-pink-500 to-amber-400'
                : 'bg-gradient-to-r from-teal-500 via-emerald-400 to-cyan-400'
            }`}
            style={{
              filter: `blur(${14 + audioData.volume * 14}px)`,
            }}
          />
        )}
      </AnimatePresence>

      {/* ── MAIN OBSIDIAN HOLOGRAPHIC CAPSULE ── */}
      <button
        type="button"
        onClick={onToggle}
        className={`group relative flex items-center gap-2.5 h-8 sm:h-8.5 rounded-full px-3 py-1 cursor-pointer transition-all duration-300 ${
          'bg-black/85 backdrop-blur-2xl'
        } ${
          isSpeaking
            ? 'border border-fuchsia-500/50 shadow-[0_0_24px_rgba(236,72,153,0.35),inset_0_1px_1px_rgba(255,255,255,0.25)]'
            : isListening
            ? 'border border-emerald-500/50 shadow-[0_0_24px_rgba(16,185,129,0.35),inset_0_1px_1px_rgba(255,255,255,0.25)]'
            : isConnecting
            ? 'border border-amber-400/50 shadow-[0_0_16px_rgba(251,191,36,0.3)]'
            : 'border border-white/15 hover:border-white/35 shadow-[0_4px_20px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.15)]'
        }`}
        style={{ minWidth: 175, maxWidth: 220 }}
        title={isConnected ? 'End voice conversation' : 'Tap to start live voice commerce'}
      >
        {/* Dynamic Luminous Status Glyph */}
        <div className="relative flex items-center justify-center shrink-0">
          {isConnecting ? (
            <Loader2 size={13} className="animate-spin text-amber-400" />
          ) : isSpeaking ? (
            <div className="relative flex items-center justify-center h-4.5 w-4.5 rounded-full bg-fuchsia-500/20 text-fuchsia-300">
              <Sparkles size={11} className="animate-pulse" />
            </div>
          ) : isListening ? (
            <div className="relative flex items-center justify-center h-4.5 w-4.5 rounded-full bg-emerald-500/20 text-emerald-400">
              <Mic size={11} className="animate-pulse" />
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-35" />
            </div>
          ) : (
            <div className="relative flex items-center justify-center h-4.5 w-4.5 rounded-full bg-white/10 text-white/80 group-hover:text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
              <Mic size={11} />
              <span className="absolute inset-0 rounded-full bg-emerald-400/40 animate-ping opacity-40" />
            </div>
          )}
        </div>

        {/* 60 FPS Fluid Harmonic Waveform Canvas */}
        <div className="flex-1 h-6 relative overflow-hidden flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
          />
        </div>

        {/* Dynamic Micro-Label Status */}
        <span className="text-[10px] font-semibold tracking-wider uppercase shrink-0 transition-colors">
          {isSpeaking ? (
            <span className="bg-gradient-to-r from-fuchsia-400 to-amber-300 bg-clip-text text-transparent">
              Speaking
            </span>
          ) : isListening ? (
            <span className="text-emerald-400">
              Listening
            </span>
          ) : isConnecting ? (
            <span className="text-amber-300">
              Connecting
            </span>
          ) : (
            <span className="text-white/70 group-hover:text-white">
              Speak
            </span>
          )}
        </span>

        {/* Call disconnect badge when active */}
        {isConnected && (
          <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-colors">
            <PhoneOff size={9} />
          </span>
        )}
      </button>
    </div>
  );
}

export default AppleVoiceHUD;
