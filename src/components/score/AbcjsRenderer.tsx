'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import abcjs from 'abcjs';
import 'abcjs/abcjs-audio.css';
import { Play, Square, Volume2 } from 'lucide-react';

interface AbcjsRendererProps {
  abcString: string;
  prependBasePitch?: boolean;
  prependMetronome?: boolean;
  timeSignature?: string;
  tempo?: number;
}

// ── WAV 인코딩 유틸리티 ─────────────────────────────────────────
function encodeWav(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitsPerSample = 16;
  const blockAlign = numChannels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  const dataLength = audioBuffer.length * blockAlign;

  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(audioBuffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

// ── 메트로놈 클릭 생성 ──────────────────────────────────────────
function createMetronomeClick(
  audioCtx: AudioContext | OfflineAudioContext,
  startTime: number,
  isAccent: boolean
) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.frequency.value = isAccent ? 1500 : 1000;
  osc.type = 'sine';

  gain.gain.setValueAtTime(isAccent ? 0.8 : 0.5, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);

  osc.start(startTime);
  osc.stop(startTime + 0.05);
}

export default function AbcjsRenderer({
  abcString,
  prependBasePitch,
  prependMetronome,
  timeSignature = '4/4',
  tempo = 120,
}: AbcjsRendererProps) {
  const paperRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const synthRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!paperRef.current) return;
    abcjs.renderAbc(paperRef.current, abcString, {
      add_classes: true,
      responsive: 'resize',
      scale: 1.2,
      staffwidth: 800,
    });
  }, [abcString]);

  const getTimingInfo = useCallback(() => {
    const [topStr, bottomStr] = timeSignature.split('/');
    const top = parseInt(topStr, 10) || 4;
    const bottom = parseInt(bottomStr, 10) || 4;
    const beatDuration = 60 / tempo;
    const actualBeatDuration = beatDuration * (4 / bottom);
    const multiplier = 16 / bottom;

    return { top, bottom, beatDuration, actualBeatDuration, multiplier };
  }, [timeSignature, tempo]);

  // ── 오디오 전체 ABC 생성 (스케일 + 메트로놈 묵음 + 본 악보) ──────────
  const buildCombinedAbc = useCallback(() => {
    const { top, multiplier } = getTimingInfo();
    const headerLines = abcString.split('\n').filter(line => /^[A-Z]:/.test(line));
    const bodyLines = abcString.split('\n').filter(line => !/^[A-Z]:/.test(line));
    const headerStr = headerLines.join('\n');
    let prepends = '';

    // 1. 스케일
    if (prependBasePitch) {
      const m = multiplier;
      prepends += `C${m} D${m} E${m} F${m} | G${m} A${m} B${m} c${m} | B${m} A${m} G${m} F${m} | E${m} D${m} C${m} z${m} | `;
    }

    // 2. 메트로놈을 위한 묵음 공간
    if (prependMetronome) {
      const m = multiplier;
      for (let i = 0; i < top; i++) {
        prepends += `z${m} `;
      }
      prepends += " | ";
    }

    return headerStr + '\n' + prepends + bodyLines.join('\n');
  }, [abcString, prependBasePitch, prependMetronome, getTimingInfo]);

  const handlePlay = useCallback(async () => {
    if (isPlaying) {
      if (synthRef.current) {
        try { synthRef.current.stop(); } catch { /* ignore */ }
      }
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);

    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const { top, actualBeatDuration } = getTimingInfo();
      const combinedAbc = buildCombinedAbc();
      const visualObj = abcjs.renderAbc("*", combinedAbc, { responsive: 'resize' })[0];

      if (visualObj) {
        const synth = new abcjs.synth.CreateSynth();
        synthRef.current = synth;
        await synth.init({ audioContext: audioCtx, visualObj });
        await synth.prime();

        // 메트로놈 클릭 스케줄링
        if (prependMetronome) {
          const metronomeStartTime = prependBasePitch ? 16 * actualBeatDuration : 0;
          for (let i = 0; i < top; i++) {
            createMetronomeClick(
              audioCtx,
              audioCtx.currentTime + metronomeStartTime + i * actualBeatDuration,
              i === 0
            );
          }
        }

        synth.start();

        const checkEnd = setInterval(() => {
          if (typeof (synth as any).getIsRunning === 'function' ? !(synth as any).getIsRunning() : true) {
            clearInterval(checkEnd);
            setIsPlaying(false);
          }
        }, 500);

        // Safety timeout
        setTimeout(() => {
          clearInterval(checkEnd);
          setIsPlaying(false);
        }, 60000); // 1 minute max
      }
    } catch (err) {
      console.error('Playback error:', err);
      setIsPlaying(false);
    }
  }, [isPlaying, buildCombinedAbc, prependBasePitch, prependMetronome, getTimingInfo]);

  const handleDownloadAudio = useCallback(async (title: string) => {
    setIsExporting(true);
    try {
      const { top, actualBeatDuration } = getTimingInfo();
      const sampleRate = 44100;
      const combinedAbc = buildCombinedAbc();
      const visualObj = abcjs.renderAbc("*", combinedAbc, { responsive: 'resize' })[0];

      if (!visualObj) throw new Error('Could not render ABC for export');

      // Estimate duration
      let totalDuration = (visualObj as any).getTotalTime ? (visualObj as any).getTotalTime() : 0;
      
      // Fallback: If totalDuration is 0 or invalid, estimate based on bars
      if (!totalDuration || isNaN(totalDuration)) {
        const barCount = (combinedAbc.match(/\|/g) || []).length + 1;
        totalDuration = barCount * top * actualBeatDuration;
      }
      
      // Add extra buffer
      totalDuration += 2;

      const numFrames = Math.max(1, Math.floor(sampleRate * totalDuration));
      if (isNaN(numFrames)) throw new Error('Invalid audio duration calculated');

      const offlineCtx = new OfflineAudioContext(2, numFrames, sampleRate);
      
      // Patch for abcjs
      (offlineCtx as any).resume = () => Promise.resolve();
      (offlineCtx as any).suspend = () => Promise.resolve();

      const synth = new abcjs.synth.CreateSynth();
      await synth.init({ audioContext: offlineCtx as any, visualObj });
      await synth.prime();

      // 메트로놈 클릭 스케줄링 (오프라인)
      if (prependMetronome) {
        const metronomeStartTime = prependBasePitch ? 16 * actualBeatDuration : 0;
        for (let i = 0; i < top; i++) {
          createMetronomeClick(
            offlineCtx,
            metronomeStartTime + i * actualBeatDuration,
            i === 0
          );
        }
      }

      synth.start();

      const renderedBuffer = await offlineCtx.startRendering();
      const wavBlob = encodeWav(renderedBuffer);

      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'score'}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      alert('음원 내보내기 중 오류가 발생했습니다.');
    } finally {
      setIsExporting(false);
    }
  }, [buildCombinedAbc, prependBasePitch, prependMetronome, getTimingInfo]);

  useEffect(() => {
    const handler = (e: any) => handleDownloadAudio(e.detail?.title);
    window.addEventListener('abcjs-download-audio', handler);
    return () => window.removeEventListener('abcjs-download-audio', handler);
  }, [handleDownloadAudio]);

  return (
    <div className="w-full flex flex-col gap-4">
      <div ref={paperRef} className="w-full min-h-[200px] bg-white text-black p-4 rounded-xl border border-border shadow-sm overflow-x-auto" />
      <div className="flex items-center gap-3 bg-slate-100 p-3 rounded-xl max-w-md mx-auto w-full">
        <button
          onClick={handlePlay}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all shadow-sm ${
            isPlaying ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-indigo-500 text-white hover:bg-indigo-600'
          }`}
        >
          {isPlaying ? <Square size={16} /> : <Play size={16} />}
          {isPlaying ? '정지' : '재생'}
        </button>
        {isExporting && (
          <span className="text-xs text-slate-500 animate-pulse flex items-center gap-1">
            <Volume2 size={14} /> 음원 생성 중...
          </span>
        )}
      </div>
    </div>
  );
}
