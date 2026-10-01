/**
 * src/components/LiveTranscript.tsx — WCAG 2.1 AA/AAA Compliant Real-Time Voice Captions
 *
 * Implements W3C WAI-ARIA live region authoring practices:
 * - Permanent in-DOM <div role="status" aria-live="polite" aria-atomic="true">
 *   ensuring screen readers (VoiceOver, NVDA, JAWS, TalkBack) reliably announce
 *   speaker turns without unmounting drops.
 * - Zero-latency streaming for user (Whisper) and assistant (Realtime) speech deltas.
 * - Proper token spacing with sliding window for single-row elegance.
 * - Intelligent timer that persists during active speech and auto-hides after comfortable reading pause.
 */
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Sparkles } from 'lucide-react';

export interface LiveTranscriptProps {
  /** Controlled enabled state */
  enabled?: boolean;
  /** Callback when toggle is requested */
  onToggle?: (enabled: boolean) => void;
  /** Duration in milliseconds before active transcript gently fades after speaking stops */
  autoHideMs?: number;
  /** Custom class overrides */
  className?: string;
}

export interface TranscriptPayload {
  text: string;
  role?: 'user' | 'assistant';
}

const STORAGE_KEY = 'live_transcript_enabled_v1';

export const LiveTranscript: React.FC<LiveTranscriptProps> = ({
  enabled: controlledEnabled,
  onToggle,
  autoHideMs = 6500, // 6.5s comfortable reading pause
  className = '',
}) => {
  const [internalEnabled, setInternalEnabled] = useState<boolean>(() => {
    if (typeof controlledEnabled === 'boolean') return controlledEnabled;
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved !== null) return saved === 'true';
      } catch {}
    }
    return true;
  });

  const isEnabled = typeof controlledEnabled === 'boolean' ? controlledEnabled : internalEnabled;

  const [currentText, setCurrentText] = useState<string>('');
  const [role, setRole] = useState<'user' | 'assistant'>('assistant');
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [srAnnouncement, setSrAnnouncement] = useState<string>('');

  const hideTimerRef = useRef<any>(null);
  const currentRoleRef = useRef<'user' | 'assistant'>('assistant');
  currentRoleRef.current = role;

  // Sync controlled prop
  useEffect(() => {
    if (typeof controlledEnabled === 'boolean') {
      setInternalEnabled(controlledEnabled);
    }
  }, [controlledEnabled]);

  // Handle external toggle broadcast
  useEffect(() => {
    const handleToggleEvent = (e: any) => {
      const next = typeof e.detail?.enabled === 'boolean' ? e.detail.enabled : !isEnabled;
      setInternalEnabled(next);
      onToggle?.(next);
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {}
    };

    window.addEventListener('live-commerce:toggle-transcript', handleToggleEvent);
    return () => {
      window.removeEventListener('live-commerce:toggle-transcript', handleToggleEvent);
    };
  }, [isEnabled, onToggle]);

  // Reset hide timer helper
  const resetHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      setIsVisible(false);
    }, autoHideMs);
  };

  // Real-time speech stream receiver
  useEffect(() => {
    const handleFullTranscript = (e: any) => {
      const detail: TranscriptPayload = e.detail;
      if (!detail || !detail.text || !detail.text.trim()) return;

      const speakerRole = detail.role || 'assistant';
      const cleanText = detail.text.trim();

      setRole(speakerRole);
      setCurrentText(cleanText);
      setIsVisible(true);

      // Dedicated screen-reader verbalization announcement
      setSrAnnouncement(`${speakerRole === 'user' ? 'You said' : 'Assistant said'}: ${cleanText}`);

      resetHideTimer();
    };

    const handleDelta = (e: any) => {
      const delta = e.detail?.delta || '';
      const speakerRole: 'user' | 'assistant' = e.detail?.role || 'assistant';
      if (!delta) return;

      setRole(speakerRole);
      setIsVisible(true);

      setCurrentText(prev => {
        // If speaker role switched, start new stream line
        let base = prev;
        if (currentRoleRef.current !== speakerRole) {
          base = '';
        }

        // Preserve natural spacing while streaming
        const combined = base ? `${base}${delta}` : delta.trimStart();
        return combined.slice(-160); // Clean single-row sliding window
      });

      resetHideTimer();
    };

    window.addEventListener('live-commerce:transcript', handleFullTranscript);
    window.addEventListener('live-commerce:transcript-delta', handleDelta);

    return () => {
      window.removeEventListener('live-commerce:transcript', handleFullTranscript);
      window.removeEventListener('live-commerce:transcript-delta', handleDelta);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [autoHideMs]);

  return (
    <>
      {/* ── 1. W3C PERMANENT ARIA LIVE REGION (Never unmounted from DOM) ── */}
      <div
        id="live-captions-announcer"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-relevant="all"
        className="sr-only"
      >
        {isEnabled && isVisible && srAnnouncement ? srAnnouncement : ''}
      </div>

      {/* ── 2. VISUAL SINGLE-ROW DISAPPEARING CAPTION HUD ── */}
      <section
        aria-label="Real-time voice captions"
        aria-hidden="true"
        className={`pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 transition-all duration-300 ${className}`}
        style={{ bottom: 'min(38vh, 230px)' }}
      >
        <AnimatePresence>
          {isEnabled && isVisible && currentText && (
            <motion.div
              key="active-caption-bubble"
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 440, damping: 32 }}
              className="group pointer-events-auto flex max-w-[min(calc(100vw-2rem),560px)] items-center gap-2.5 rounded-full border border-white/20 bg-zinc-950/90 px-4 py-2 text-xs text-white shadow-[0_12px_44px_rgba(0,0,0,0.85)] backdrop-blur-2xl"
            >
              {/* Speaker Glyph */}
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  role === 'user'
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/35'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/35'
                }`}
              >
                {role === 'user' ? <Mic size={11} /> : <Sparkles size={11} />}
              </div>

              {/* Speaker Label & Live Spoken Text */}
              <p className="min-w-0 flex-1 truncate font-medium tracking-wide text-zinc-100 select-none">
                <span className="opacity-75 mr-1.5 font-bold uppercase text-[9px] tracking-wider text-zinc-400">
                  {role === 'user' ? 'You' : 'Assistant'}:
                </span>
                <span className="text-white font-medium">{currentText}</span>
              </p>

              {/* Pulsing Audio Reactivity Bead */}
              <span className="relative flex h-2 w-2 shrink-0">
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                    role === 'user' ? 'bg-sky-400' : 'bg-emerald-400'
                  }`}
                />
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    role === 'user' ? 'bg-sky-500' : 'bg-emerald-500'
                  }`}
                />
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </>
  );
};

export default LiveTranscript;
