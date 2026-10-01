/**
 * commerce/voice/types.ts — Core Voice Call & Visualizer State Types
 *
 * Dedicated definitions for the 3 visualizer states, audio frequency bands,
 * and session state contracts.
 */

export type VoiceState = 'idle' | 'listening' | 'speaking' | 'connecting';

export interface AudioFrequencyData {
  /** Root-mean-square decibel level (0.0 to 1.0) */
  volume: number;
  /** Normalized frequency bands for multi-bar visualizers (0.0 to 1.0 per bar) */
  bars: number[];
  /** Is there active speech detected above the noise floor */
  hasVoiceActivity: boolean;
}

export interface VoiceThemeConfig {
  /** Color signature for the 3 states */
  idle: {
    accent: string;
    glow: string;
    border: string;
    barGradient: string;
  };
  listening: {
    accent: string;
    glow: string;
    border: string;
    barGradient: string;
  };
  speaking: {
    accent: string;
    glow: string;
    border: string;
    barGradient: string;
  };
}
