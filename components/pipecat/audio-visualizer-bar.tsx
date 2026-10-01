/**
 * components/pipecat/audio-visualizer-bar.tsx
 *
 * Canvas-based Audio Visualizer Bar tuned for speech audio and Pipecat participants.
 * Supports:
 *   · Track-driven real-time spectrum analysis (200Hz - 8kHz mel scale)
 *   · Idle resting dots when silent or track is null
 *   · isConnecting override: rolls opacity across resting dots
 *   · isThinking override: traveling wave
 *   · barOrigin: "top" | "bottom" | "center"
 *   · data-state attribute exposed on canvas
 */
import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  type VisualizerState,
  type AudioVisualizerCommonProps,
  createTrackAnalyser,
  getVoiceMelBands,
} from './visualizer';

export interface AudioVisualizerBarViewProps extends AudioVisualizerCommonProps {
  /** Audio track to visualize (null = idle resting dots) */
  track?: MediaStreamTrack | null;
  className?: string;
  style?: React.CSSProperties;
}

export interface AudioVisualizerBarProps extends AudioVisualizerBarViewProps {
  /** Whose audio to visualize when in connected mode */
  participantType?: 'local' | 'bot';
}

export function AudioVisualizerBarView({
  track = null,
  barCount = 8,
  barWidth = 3,
  barGap = 3,
  barMaxHeight = 20,
  barOrigin = 'center',
  barSpeed = 0.5,
  barColor = 'currentColor',
  noPeaks = false,
  isConnecting = false,
  isThinking = false,
  connectingSpeed = 2.5,
  thinkingSpeed = 3.0,
  thinkingWaveWidth = 3,
  thinkingHeight = 0.35,
  thinkingAlpha = 0.5,
  className = '',
  style,
}: AudioVisualizerBarViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visualizerState, setVisualizerState] = useState<VisualizerState>('silent');

  // Total canvas geometry
  const totalWidth = useMemo(
    () => barCount * barWidth + (barCount - 1) * barGap,
    [barCount, barWidth, barGap]
  );
  const totalHeight = barMaxHeight;

  // Smoothing buffers
  const currentHeightsRef = useRef<number[]>(new Array(barCount).fill(barWidth));
  const peakHeightsRef = useRef<number[]>(new Array(barCount).fill(barWidth));

  useEffect(() => {
    // Determine state
    if (isConnecting) {
      setVisualizerState('connecting');
    } else if (isThinking) {
      setVisualizerState('thinking');
    } else if (!track) {
      setVisualizerState('silent');
    }
  }, [isConnecting, isThinking, track]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let startTime = performance.now();

    // Setup Web Audio Analyser if track is present
    let analyserObj: ReturnType<typeof createTrackAnalyser> | null = null;
    let melBands: number[] = [];

    if (track && track.readyState === 'live') {
      analyserObj = createTrackAnalyser(track);
      if (analyserObj) {
        melBands = getVoiceMelBands(
          barCount,
          analyserObj.audioCtx.sampleRate,
          analyserObj.analyser.fftSize
        );
      }
    }

    const render = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Resolve bar color
      let resolvedColor = barColor;
      if (barColor === 'currentColor' || barColor.startsWith('--')) {
        const computed = getComputedStyle(canvas);
        resolvedColor = barColor.startsWith('--')
          ? computed.getPropertyValue(barColor).trim() || '#ffffff'
          : computed.color || '#ffffff';
      }

      ctx.fillStyle = resolvedColor;

      // Minimum resting height is circular dot = barWidth
      const dotDiameter = Math.min(barWidth, barMaxHeight);

      if (isConnecting) {
        setVisualizerState('connecting');
        // Roll opacity across resting dots
        for (let i = 0; i < barCount; i++) {
          const x = i * (barWidth + barGap);
          const y =
            barOrigin === 'bottom'
              ? totalHeight - dotDiameter
              : barOrigin === 'top'
              ? 0
              : (totalHeight - dotDiameter) / 2;

          const phase = i / barCount;
          const alpha = 0.25 + 0.75 * Math.max(0, Math.sin(elapsed * connectingSpeed - phase * Math.PI * 2));

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, dotDiameter, barWidth / 2);
          ctx.fill();
          ctx.restore();
        }
      } else if (isThinking) {
        setVisualizerState('thinking');
        // Traveling wave animation
        const waveH = barMaxHeight * thinkingHeight;
        for (let i = 0; i < barCount; i++) {
          const x = i * (barWidth + barGap);
          const wavePhase = (i / thinkingWaveWidth) - elapsed * thinkingSpeed;
          const waveVal = (Math.sin(wavePhase) + 1) / 2;
          const h = Math.max(dotDiameter, waveVal * waveH);
          const alpha = thinkingAlpha + (1 - thinkingAlpha) * waveVal;

          const y =
            barOrigin === 'bottom'
              ? totalHeight - h
              : barOrigin === 'top'
              ? 0
              : (totalHeight - h) / 2;

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, h, barWidth / 2);
          ctx.fill();
          ctx.restore();
        }
      } else if (analyserObj && track && track.readyState === 'live') {
        // Read real-time frequency data
        analyserObj.analyser.getByteFrequencyData(analyserObj.dataArray);
        let hasSpeech = false;

        const targetHeights: number[] = [];
        for (let i = 0; i < barCount; i++) {
          const binIndex = melBands[i] ?? i;
          const rawVal = analyserObj.dataArray[binIndex] || 0;

          // High frequency rolloff compensation
          const boost = 1 + (i / barCount) * 1.5;
          const normalized = Math.min(1, (rawVal / 255) * boost);

          if (normalized > 0.08) hasSpeech = true;

          const targetH = Math.max(dotDiameter, normalized * barMaxHeight);
          targetHeights.push(targetH);
        }

        setVisualizerState(hasSpeech ? 'speaking' : 'silent');

        // Render bars with smoothing
        for (let i = 0; i < barCount; i++) {
          const currentH = currentHeightsRef.current[i] ?? dotDiameter;
          const targetH = targetHeights[i];
          const newH = currentH + (targetH - currentH) * Math.min(1, barSpeed);
          currentHeightsRef.current[i] = newH;

          const x = i * (barWidth + barGap);
          const y =
            barOrigin === 'bottom'
              ? totalHeight - newH
              : barOrigin === 'top'
              ? 0
              : (totalHeight - newH) / 2;

          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, newH, barWidth / 2);
          ctx.fill();

          // Peaks
          if (!noPeaks) {
            const peak = Math.max(newH, (peakHeightsRef.current[i] || 0) * 0.94);
            peakHeightsRef.current[i] = peak;
            const peakY =
              barOrigin === 'bottom'
                ? totalHeight - peak - 1
                : barOrigin === 'top'
                ? peak
                : (totalHeight - peak) / 2;

            ctx.save();
            ctx.globalAlpha = 0.8;
            ctx.fillRect(x, Math.max(0, peakY), barWidth, 1.5);
            ctx.restore();
          }
        }
      } else {
        // Resting dots (silent state / null track)
        setVisualizerState('silent');
        for (let i = 0; i < barCount; i++) {
          const x = i * (barWidth + barGap);
          const y =
            barOrigin === 'bottom'
              ? totalHeight - dotDiameter
              : barOrigin === 'top'
              ? 0
              : (totalHeight - dotDiameter) / 2;

          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, dotDiameter, barWidth / 2);
          ctx.fill();
          ctx.restore();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      analyserObj?.cleanup();
    };
  }, [
    track,
    barCount,
    barWidth,
    barGap,
    barMaxHeight,
    barOrigin,
    barSpeed,
    barColor,
    noPeaks,
    isConnecting,
    isThinking,
    connectingSpeed,
    thinkingSpeed,
    thinkingWaveWidth,
    thinkingHeight,
    thinkingAlpha,
    totalHeight,
  ]);

  return (
    <canvas
      ref={canvasRef}
      width={totalWidth}
      height={totalHeight}
      data-state={visualizerState}
      className={className}
      style={{
        display: 'block',
        width: totalWidth,
        height: totalHeight,
        ...style,
      }}
    />
  );
}

/**
 * Connected variant: visualizes Pipecat participant or active bot/local audio
 */
export function AudioVisualizerBar({
  participantType = 'bot',
  track = null,
  ...props
}: AudioVisualizerBarProps) {
  return <AudioVisualizerBarView track={track} {...props} />;
}

export default AudioVisualizerBar;
