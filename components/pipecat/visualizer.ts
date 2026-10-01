/**
 * components/pipecat/visualizer.ts
 *
 * Core audio visualization primitives and frequency analysis tuned for human voice.
 * Spans 200 Hz – 8 kHz on the mel scale with speech high-frequency rolloff compensation.
 */

export type VisualizerState = "connecting" | "silent" | "speaking" | "thinking";

export interface AudioVisualizerCommonProps {
  barCount?: number;
  barWidth?: number;
  barGap?: number;
  barMaxHeight?: number;
  barOrigin?: "top" | "bottom" | "center";
  barSpeed?: number;
  barColor?: string;
  noPeaks?: boolean;
  peakDecay?: number;
  isConnecting?: boolean;
  isThinking?: boolean;
  connectingSpeed?: number;
  thinkingSpeed?: number;
  thinkingWaveWidth?: number;
  thinkingHeight?: number;
  thinkingAlpha?: number;
}

export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

export function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

/**
 * Generates band center bin indices for Web Audio AnalyserNode across 200Hz - 8000Hz mel scale.
 */
export function getVoiceMelBands(count: number, sampleRate: number, fftSize: number): number[] {
  const minHz = 200;
  const maxHz = Math.min(8000, sampleRate / 2);
  const minMel = hzToMel(minHz);
  const maxMel = hzToMel(maxHz);

  const melStep = (maxMel - minMel) / (count + 1);
  const bins: number[] = [];

  for (let i = 1; i <= count; i++) {
    const mel = minMel + i * melStep;
    const hz = melToHz(mel);
    const bin = Math.round((hz * fftSize) / sampleRate);
    bins.push(Math.max(1, Math.min(fftSize / 2 - 1, bin)));
  }
  return bins;
}

/**
 * Creates and binds a Web Audio AnalyserNode to a MediaStreamTrack.
 */
export function createTrackAnalyser(track: MediaStreamTrack) {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  try {
    const audioCtx = new AudioContextClass();
    const mediaStream = new MediaStream([track]);
    const sourceNode = audioCtx.createMediaStreamSource(mediaStream);

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;
    sourceNode.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const cleanup = () => {
      try {
        sourceNode.disconnect();
        analyser.disconnect();
        if (audioCtx.state !== 'closed') {
          audioCtx.close();
        }
      } catch {
        // ignore
      }
    };

    return {
      audioCtx,
      analyser,
      dataArray,
      cleanup,
    };
  } catch (err) {
    console.warn('[Pipecat Visualizer] AudioContext setup failed:', err);
    return null;
  }
}
