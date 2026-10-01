/**
 * commerce/VoiceCall.tsx — Voice Call Agent & Orchestrator
 *
 * Keeps state management and audio session logic completely modular:
 * - Types in ./voice/types.ts
 * - Real-time Web Audio Analyser in ./voice/useAudioAnalyser.ts
 * - Apple-grade 2026/2027 Visualizer HUD in ./voice/AppleVoiceHUD.tsx
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { RealtimeAgent, RealtimeSession, OpenAIRealtimeWebRTC } from '@openai/agents/realtime';
import type { VoiceState } from './voice/types';
import { useAudioAnalyser } from './voice/useAudioAnalyser';
import { AppleVoiceHUD } from './voice/AppleVoiceHUD';
import { buildSystemPrompt } from './systemPrompt';

export interface VoiceCallProps {
  active?: boolean;
  onToggle?: (nextState: boolean) => void;
  onStatusChange?: (msg: string) => void;
  className?: string;
}

export function VoiceVisualizer({
  active = false,
  onToggle,
  onStatusChange,
  className = '',
}: VoiceCallProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [permissionError, setPermissionError] = useState<boolean>(false);

  // Live media streams for physical Web Audio AnalyserNode
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteAudioEl, setRemoteAudioEl] = useState<HTMLAudioElement | null>(null);

  const sessionRef = useRef<RealtimeSession | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // Real physical Web Audio Analyser frequency & decibels hook
  const audioData = useAudioAnalyser({
    localStream,
    audioElement: remoteAudioEl,
    state: voiceState,
  });

  const notify = useCallback((msg: string) => {
    if (onStatusChange) onStatusChange(msg);
    console.log(`[VoiceCall] ${msg}`);
  }, [onStatusChange]);

  const stopVoiceSession = useCallback(() => {
    setVoiceState('idle');

    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) {
        console.error('[VoiceCall] Error closing session:', e);
      }
      sessionRef.current = null;
    }

    if (micStreamRef.current) {
      try {
        micStreamRef.current.getTracks().forEach(t => t.stop());
      } catch {}
      micStreamRef.current = null;
    }
    setLocalStream(null);

    if (audioElRef.current) {
      try {
        audioElRef.current.srcObject = null;
        audioElRef.current.remove();
      } catch {}
      audioElRef.current = null;
    }
    setRemoteAudioEl(null);

    notify('Voice call ended');
    onToggle?.(false);
  }, [notify, onToggle]);

  const startVoiceSession = useCallback(async () => {
    if (voiceState !== 'idle') return;
    setVoiceState('connecting');
    setPermissionError(false);
    notify('Requesting microphone & initializing session...');

    try {
      // 1. Acquire live user microphone stream for local analysis & WebRTC transport
      let micStream: MediaStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (micErr: any) {
        if (micErr.name === 'NotAllowedError' || micErr.message?.includes('Permission denied')) {
          setPermissionError(true);
          throw new Error('Microphone permission blocked. Open in standalone tab to grant access.');
        }
        throw micErr;
      }

      micStreamRef.current = micStream;
      setLocalStream(micStream);

      // 2. Create remote audio element for assistant speech analysis & playback
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioElRef.current = audioEl;
      setRemoteAudioEl(audioEl);

      const domain = typeof window !== 'undefined' ? window.location.hostname : 'our store';

      // 3. Request ephemeral client secret from server
      const res = await fetch('/api/realtime-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorDetail = data?.error?.message || data?.error || JSON.stringify(data);
        throw new Error(`OpenAI API error (${res.status}): ${errorDetail}`);
      }

      const ephemeralKey =
        data.value ||
        data.client_secret?.value ||
        data.client_secret ||
        data.key;

      if (!ephemeralKey) {
        throw new Error('No client secret received from OpenAI.');
      }

      const selectedModel = data.session?.model || data.model || 'gpt-realtime-2';

      // 4. Initialize RealtimeAgent with domain identity
      const agent = new RealtimeAgent({
        name: 'Assistant',
        instructions: buildSystemPrompt({ domain }),
      });

      // 5. Initialize WebRTC Transport wired to our controlled microphone & speaker nodes
      const transport = new OpenAIRealtimeWebRTC({
        mediaStream: micStream,
        audioElement: audioEl,
      });

      // 6. Initialize RealtimeSession using official SDK
      const session = new RealtimeSession(agent, {
        model: selectedModel,
        transport,
      });
      sessionRef.current = session;

      // 6b. Direct real-time transport listeners for instant zero-latency speech deltas
      try {
        (transport as any).on?.('audio_transcript_delta', (deltaEvt: any) => {
          if (deltaEvt?.delta) {
            window.dispatchEvent(
              new CustomEvent('live-commerce:transcript-delta', {
                detail: { delta: deltaEvt.delta, role: 'assistant' },
              })
            );
          }
        });
        (transport as any).on?.('output_text_delta', (deltaEvt: any) => {
          if (deltaEvt?.delta) {
            window.dispatchEvent(
              new CustomEvent('live-commerce:transcript-delta', {
                detail: { delta: deltaEvt.delta, role: 'assistant' },
              })
            );
          }
        });
      } catch {}

      // 6c. RealtimeSession history and agent completion events for instant transcript updates
      session.on('history_updated', (history: any[]) => {
        if (!history || history.length === 0) return;
        const last = history[history.length - 1];
        if (!last || last.type !== 'message') return;

        const role = last.role === 'user' ? 'user' : 'assistant';
        let text = '';

        if (Array.isArray(last.content)) {
          for (const part of last.content) {
            if (part.type === 'input_audio' && part.transcript) {
              text = part.transcript;
            } else if (part.type === 'output_audio' && part.transcript) {
              text = part.transcript;
            } else if (part.type === 'output_text' && part.text) {
              text = part.text;
            } else if (part.type === 'input_text' && part.text) {
              text = part.text;
            }
          }
        }

        if (text && text.trim()) {
          window.dispatchEvent(
            new CustomEvent('live-commerce:transcript', {
              detail: { text: text.trim(), role },
            })
          );
        }
      });

      session.on('agent_end', (_context: any, _agent: any, output: string) => {
        if (output && output.trim()) {
          window.dispatchEvent(
            new CustomEvent('live-commerce:transcript', {
              detail: { text: output.trim(), role: 'assistant' },
            })
          );
        }
      });

      // 7. Track the 3 visualizer states and tool call responses
      session.on('audio_start', () => {
        setVoiceState('speaking');
      });

      session.on('audio_stopped', () => {
        setVoiceState('listening');
      });

      session.on('audio_interrupted', () => {
        setVoiceState('listening');
      });

      session.on('mcp_tool_call_completed', (details: any) => {
        try {
          const rawStr = JSON.stringify(details);
          const match = rawStr.match(/https?:\/\/[^\s"'\\]+\.(png|jpg|jpeg|webp)/i);
          if (match && match[0]) {
            notify('Rendering virtual try-on result');
            window.dispatchEvent(
              new CustomEvent('live-commerce:tryon-result', {
                detail: { imageUrl: match[0] },
              })
            );
          }
        } catch {}
      });

      session.on('transport_event', (event: any) => {
        if (event.type === 'response.audio.delta') {
          setVoiceState('speaking');
        } else if (
          event.type === 'response.audio.done' ||
          event.type === 'response.done' ||
          event.type === 'input_audio_buffer.speech_started'
        ) {
          setVoiceState('listening');
        }

        // Dispatch real-time voice transcriptions (Whisper user audio & assistant output)
        if (event.type === 'conversation.item.input_audio_transcription.completed') {
          const userTranscript = event.transcript;
          if (userTranscript) {
            window.dispatchEvent(
              new CustomEvent('live-commerce:transcript', {
                detail: { text: userTranscript, role: 'user' },
              })
            );
          }
        } else if (event.type === 'response.audio_transcript.delta') {
          const delta = event.delta;
          if (delta) {
            window.dispatchEvent(
              new CustomEvent('live-commerce:transcript-delta', {
                detail: { delta, role: 'assistant' },
              })
            );
          }
        } else if (event.type === 'response.audio_transcript.done') {
          const assistantTranscript = event.transcript;
          if (assistantTranscript) {
            window.dispatchEvent(
              new CustomEvent('live-commerce:transcript', {
                detail: { text: assistantTranscript, role: 'assistant' },
              })
            );
          }
        }

        // Detect any returned virtual try-on images from output items
        if (event.type === 'response.function_call_arguments.done' || event.type === 'response.output_item.done') {
          try {
            const rawStr = JSON.stringify(event);
            const match = rawStr.match(/https?:\/\/[^\s"'\\]+\.(png|jpg|jpeg|webp)/i);
            if (match && match[0]) {
              window.dispatchEvent(
                new CustomEvent('live-commerce:tryon-result', {
                  detail: { imageUrl: match[0] },
                })
              );
            }
          } catch {}
        }
      });

      session.on('error', (err: any) => {
        console.error('[VoiceCall] Realtime session error:', err);
      });

      // 8. Connect WebRTC session with model query parameter
      await session.connect({
        apiKey: ephemeralKey,
        model: selectedModel,
        url: `https://api.openai.com/v1/realtime/calls?model=${selectedModel}`,
      });

      setVoiceState('listening');
      notify('Voice assistant listening (Shimmer)');
      onToggle?.(true);
    } catch (err: any) {
      console.error('[VoiceCall] Failed to start voice session:', err);
      notify(`Connection failed: ${err.message || 'Error connecting to OpenAI'}`);
      stopVoiceSession();
    }
  }, [voiceState, notify, onToggle, stopVoiceSession]);

  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, []);

  const handleToggle = () => {
    if (voiceState !== 'idle') {
      stopVoiceSession();
    } else {
      startVoiceSession();
    }
  };

  return (
    <div className="relative flex flex-col items-center">
      {/* The 2026/2027 Apple Luxury Visualizer HUD */}
      <AppleVoiceHUD
        state={voiceState}
        audioData={audioData}
        onToggle={handleToggle}
        className={className}
      />

      {/* Permission helper if user's browser blocked microphone or in restricted iframe */}
      <AnimatePresence>
        {permissionError && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-full mb-3 w-80 rounded-2xl bg-zinc-950/95 border border-red-500/40 p-3.5 text-zinc-100 shadow-2xl text-left text-xs z-50 backdrop-blur-xl"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1.5">
                <p className="font-bold text-red-300">Microphone Access Denied</p>
                <p className="text-[11px] text-zinc-300 leading-snug">
                  Browser blocked microphone permissions. Click below to open in a direct tab where your browser prompts for permission.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <a
                    href={typeof window !== 'undefined' ? window.location.href : '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-[11px] font-bold text-black hover:bg-zinc-200 transition-colors"
                  >
                    <span>Open in New Tab</span>
                    <ExternalLink size={11} />
                  </a>
                  <button
                    type="button"
                    onClick={() => setPermissionError(false)}
                    className="text-[11px] text-zinc-400 hover:text-white px-2 py-1 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default VoiceVisualizer;
