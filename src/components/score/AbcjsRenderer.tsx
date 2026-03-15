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
  scaleTempo?: number;
  keySignature?: string;
  metronomeFreq?: number;
  segmentPlay?: boolean;
  segmentMeasures?: number;
  segmentWaitSeconds?: number;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function splitBodyMeasures(body: string): string[] {
  return body.replace(/\|\]\s*$/g, '').split('|').map(s => s.trim()).filter(Boolean);
}

function parseAbcParts(abc: string) {
  const lines = abc.split('\n');
  const isHdr = (l: string) => (/^[A-Z]:/.test(l) && !/^V:/.test(l)) || /^%%/.test(l);
  const header = lines.filter(isHdr).join('\n');
  const bodyLines = lines.filter(l => !isHdr(l));
  const bodyStr = bodyLines.join('\n');
  const isGrand = bodyStr.includes('V:V1');

  if (!isGrand) {
    return { header, isGrand: false, treble: splitBodyMeasures(bodyStr), bass: [] as string[] };
  }
  const v1 = bodyStr.match(/V:V1[^\n]*\n([\s\S]*?)(?=\nV:V2)/m);
  const v2 = bodyStr.match(/V:V2[^\n]*\n([\s\S]*)$/m);
  return {
    header,
    isGrand: true,
    treble: splitBodyMeasures(v1?.[1] || ''),
    bass: splitBodyMeasures(v2?.[1] || ''),
  };
}

function rebuildSegmentAbc(header: string, isGrand: boolean, treble: string[], bass: string[]): string {
  if (!isGrand) return header + '\n' + treble.join(' | ') + ' |]';
  return (
    header +
    '\nV:V1 clef=treble\n' + treble.join(' | ') + ' |]' +
    '\nV:V2 clef=bass\n' + bass.join(' | ') + ' |]'
  );
}

const SCALE_NOTES: Record<string, string[]> = {
  'C':   ['C','D','E','F','G','A','B','c'],
  'G':   ['G','A','B','c','d','e','f','g'],
  'D':   ['D','E','F','G','A','B','c','d'],
  'A':   ['A,','B,','C','D','E','F','G','A'],
  'F':   ['F','G','A','B','c','d','e','f'],
  'Bb':  ['B,','C','D','E','F','G','A','B'],
  'Eb':  ['E','F','G','A','B','c','d','e'],
  'Am':  ['A,','B,','C','D','E','F','G','A'],
  'Em':  ['E','F','G','A','B','c','d','e'],
  'Bm':  ['B,','C','D','E','F','G','A','B'],
  'F#m': ['F,','G,','A,','B,','C','D','E','F'],
  'Dm':  ['D','E','F','G','A','B','c','d'],
  'Gm':  ['G,','A,','B,','C','D','E','F','G'],
  'Cm':  ['C','D','E','F','G','A','B','c'],
};

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
  isAccent: boolean,
  frequency: number = 1000
) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.frequency.value = frequency;
  osc.type = 'sine';

  gain.gain.setValueAtTime(0.5, startTime);
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
  scaleTempo = 120,
  keySignature = 'C',
  metronomeFreq = 1000,
  segmentPlay = false,
  segmentMeasures = 2,
  segmentWaitSeconds = 3,
}: AbcjsRendererProps) {
  const paperRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const synthRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!paperRef.current) return;
    abcjs.renderAbc(paperRef.current, abcString, {
      add_classes: true,
      responsive: 'resize',
      scale: 1.2,
      staffwidth: 800,
    });
  }, [abcString]);

  // 템포를 인자로 받는 타이밍 계산 함수
  const getTimingForBpm = useCallback((bpm: number) => {
    const [topStr, bottomStr] = timeSignature.split('/');
    const top = parseInt(topStr, 10) || 4;
    const bottom = parseInt(bottomStr, 10) || 4;
    const beatDuration = 60 / bpm;
    const actualBeatDuration = beatDuration * (4 / bottom);
    const multiplier = 16 / bottom;

    return { top, bottom, beatDuration, actualBeatDuration, multiplier };
  }, [timeSignature]);

  const getTimingInfo = useCallback(() => getTimingForBpm(tempo), [getTimingForBpm, tempo]);
  const getScaleTimingInfo = useCallback(() => getTimingForBpm(scaleTempo), [getTimingForBpm, scaleTempo]);

  // ── 오디오 전체 ABC 생성 (스케일 + 메트로놈 묵음 + 본 악보) ──────────
  const buildCombinedAbc = useCallback(() => {
    const { multiplier } = getTimingInfo();
    const lines = abcString.split('\n');
    const isHeader = (l: string) => (/^[A-Z]:/.test(l) && !/^V:/.test(l)) || /^%%/.test(l);
    const headerLines = lines.filter(isHeader);
    const bodyLines = lines.filter(l => !isHeader(l));
    const headerStr = headerLines.join('\n');

    // 큰보표(grand staff) 여부 감지
    const isGrandStaff = abcString.includes('V:V1') || abcString.includes('V:V2');

    // 스케일 프리픽스 문자열 생성
    let scalePrepend = '';
    if (prependBasePitch) {
      const m = multiplier;
      const ascending = SCALE_NOTES[keySignature] || SCALE_NOTES['C'];
      const descending = [...ascending].slice(0, -1).reverse();
      const allNotes = [...ascending, ...descending, 'z'];

      const [topStr, bottomStr] = timeSignature.split('/');
      const bottom = parseInt(bottomStr, 10) || 4;
      const sixteenthsPerBar = parseInt(topStr, 10) * (16 / bottom);
      let barPos = 0;

      scalePrepend += `[Q:${scaleTempo}] `;
      for (const n of allNotes) {
        scalePrepend += `${n}${m} `;
        barPos += m;
        if (barPos >= sixteenthsPerBar) {
          scalePrepend += '| ';
          barPos = 0;
        }
      }
      if (barPos > 0) scalePrepend += '| ';
      scalePrepend += `[Q:${tempo}] `;
    }

    // 메트로놈 묵음 프리픽스 문자열 생성
    let metronomePrepend = '';
    if (prependMetronome) {
      const m = multiplier;
      const { top } = getTimingInfo();
      for (let i = 0; i < top; i++) {
        metronomePrepend += `z${m} `;
      }
      metronomePrepend += '| ';
    }

    const prepends = scalePrepend + metronomePrepend;

    if (!isGrandStaff) {
      return headerStr + '\n' + prepends + bodyLines.join('\n');
    }

    // 큰보표: V:V1 보이스 앞에만 스케일/메트로놈 삽입,
    // V:V2(bass)는 같은 길이의 묵음으로 채워줌
    const bodyStr = bodyLines.join('\n');
    const v1Match = bodyStr.match(/^(V:V1[^\n]*\n)([\s\S]*?)(?=\nV:V2|\n*$)/m);
    const v2Match = bodyStr.match(/(\nV:V2[^\n]*\n)([\s\S]*)$/m);

    if (!v1Match || !v2Match) {
      // fallback: 파싱 실패시 단순 삽입
      return headerStr + '\n' + prepends + bodyStr;
    }

    const v1Header = v1Match[1];
    const v1Body = v1Match[2];
    const v2Header = v2Match[1];
    const v2Body = v2Match[2];

    // bass 보이스용 묵음 계산 (스케일 + 메트로놈 길이만큼)
    let bassSilence = '';
    if (prependBasePitch) {
      const m = multiplier;
      const [topStr, bottomStr] = timeSignature.split('/');
      const bottom = parseInt(bottomStr, 10) || 4;
      const sixteenthsPerBar = parseInt(topStr, 10) * (16 / bottom);
      // 16음표(상행8+하행7+쉼표1) = 16박
      let barPos = 0;
      for (let i = 0; i < 16; i++) {
        bassSilence += `z${m} `;
        barPos += m;
        if (barPos >= sixteenthsPerBar) {
          bassSilence += '| ';
          barPos = 0;
        }
      }
      if (barPos > 0) bassSilence += '| ';
    }
    if (prependMetronome) {
      const m = multiplier;
      const { top } = getTimingInfo();
      for (let i = 0; i < top; i++) {
        bassSilence += `z${m} `;
      }
      bassSilence += '| ';
    }

    return (
      headerStr + '\n' +
      v1Header + prepends + v1Body +
      v2Header + bassSilence + v2Body
    );
  }, [abcString, prependBasePitch, prependMetronome, getTimingInfo, getScaleTimingInfo, scaleTempo, tempo, keySignature, timeSignature]);

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
      const { actualBeatDuration: scaleBeatDuration } = getScaleTimingInfo();
      const combinedAbc = buildCombinedAbc();
      const parsed = abcjs.renderAbc("*", combinedAbc, { responsive: 'resize' });
      const visualObj = parsed?.[0];

      if (visualObj && (visualObj as any).lines?.length) {
        const synth = new abcjs.synth.CreateSynth();
        synthRef.current = synth;
        await synth.init({ audioContext: audioCtx, visualObj });
        await synth.prime();

        if (prependMetronome) {
          const metronomeStartTime = prependBasePitch ? 16 * scaleBeatDuration : 0;
          for (let i = 0; i < top; i++) {
            createMetronomeClick(
              audioCtx,
              audioCtx.currentTime + metronomeStartTime + i * actualBeatDuration,
              i === 0,
              metronomeFreq
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
  }, [isPlaying, buildCombinedAbc, prependBasePitch, prependMetronome, getTimingInfo, getScaleTimingInfo, metronomeFreq]);

  // ── 마디연주 (segmented playback) ────────────────────────────────
  // durationSec: 예상 재생 시간(초). 이 시간만큼 기다린 후 resolve.
  const playSingleAbc = useCallback(async (
    audioCtx: AudioContext,
    abc: string,
    durationSec: number
  ): Promise<void> => {
    try {
      const parsed = abcjs.renderAbc("*", abc, { responsive: 'resize' });
      const vo = parsed?.[0];
      if (!vo || !(vo as any).lines?.length) return;

      const synth = new abcjs.synth.CreateSynth();
      synthRef.current = synth;
      await synth.init({ audioContext: audioCtx, visualObj: vo });
      await synth.prime();
      synth.start();

      // 실제 재생 시간만큼 대기 (100ms 단위로 취소 여부 체크)
      const waitMs = durationSec * 1000 + 200; // 200ms 여유
      const step = 100;
      let elapsed = 0;
      while (elapsed < waitMs) {
        if (cancelRef.current) {
          try { synth.stop(); } catch { /* ignore */ }
          return;
        }
        await sleep(step);
        elapsed += step;
      }
    } catch { /* ignore */ }
  }, []);

  const handleSegmentPlay = useCallback(async () => {
    if (isPlaying) {
      cancelRef.current = true;
      if (synthRef.current) try { synthRef.current.stop(); } catch { /* ignore */ }
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    cancelRef.current = false;

    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
      }
      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === 'suspended') await audioCtx.resume();

      const { top, actualBeatDuration, multiplier } = getTimingInfo();
      const { actualBeatDuration: scaleBeatDuration } = getScaleTimingInfo();
      // 1박(beat) 시간: actualBeatDuration 초
      // 1마디 시간: top * actualBeatDuration 초
      const measureDurationSec = top * actualBeatDuration;

      // 1) 스케일 재생 (옵션)
      if (prependBasePitch && !cancelRef.current) {
        const { header } = parseAbcParts(abcString);
        const ascending = SCALE_NOTES[keySignature] || SCALE_NOTES['C'];
        const descending = [...ascending].slice(0, -1).reverse();
        const allNotes = [...ascending, ...descending, 'z'];
        const [topStr, bottomStr] = timeSignature.split('/');
        const bottom = parseInt(bottomStr, 10) || 4;
        const sixteenthsPerBar = parseInt(topStr, 10) * (16 / bottom);
        let barPos = 0;
        let scaleBody = `[Q:${scaleTempo}] `;
        for (const n of allNotes) {
          scaleBody += `${n}${multiplier} `;
          barPos += multiplier;
          if (barPos >= sixteenthsPerBar) { scaleBody += '| '; barPos = 0; }
        }
        if (barPos > 0) scaleBody += '| ';
        const cleanHeader = header.replace(/^%%staves.*$/gm, '').replace(/^%%barsperstaff.*$/gm, '');
        const scaleAbc = cleanHeader + '\n' + scaleBody + '|]';
        // 스케일 16음 × 1음당 걸리는 시간
        const scaleNoteDur = scaleBeatDuration; // 1박 단위 음표
        const scaleDurationSec = 16 * scaleNoteDur;
        await playSingleAbc(audioCtx, scaleAbc, scaleDurationSec);
        if (cancelRef.current) { setIsPlaying(false); return; }
      }

      // 2) 본 악보를 마디 단위로 분할
      const { header, isGrand, treble, bass } = parseAbcParts(abcString);
      const totalMeasures = treble.length;

      for (let start = 0; start < totalMeasures; start += segmentMeasures) {
        if (cancelRef.current) break;

        // 메트로놈 1마디 클릭
        if (prependMetronome || start > 0) {
          for (let j = 0; j < top; j++) {
            createMetronomeClick(audioCtx, audioCtx.currentTime + j * actualBeatDuration, j === 0, metronomeFreq);
          }
          await sleep(measureDurationSec * 1000);
          if (cancelRef.current) break;
        }

        // 세그먼트 ABC 빌드 & 재생
        const end = Math.min(start + segmentMeasures, totalMeasures);
        const actualSegCount = end - start;
        const segDurationSec = actualSegCount * measureDurationSec;
        const segAbc = rebuildSegmentAbc(
          header, isGrand,
          treble.slice(start, end),
          isGrand ? bass.slice(start, end) : []
        );
        await playSingleAbc(audioCtx, segAbc, segDurationSec);
        if (cancelRef.current) break;

        // 마지막 세그먼트가 아닌 경우 대기
        if (end < totalMeasures) {
          await sleep(segmentWaitSeconds * 1000);
        }
      }
    } catch (err) {
      console.error('Segment playback error:', err);
    }

    setIsPlaying(false);
  }, [isPlaying, abcString, prependBasePitch, prependMetronome, getTimingInfo, getScaleTimingInfo,
      playSingleAbc, keySignature, timeSignature, scaleTempo, metronomeFreq, segmentMeasures, segmentWaitSeconds]);

  const onPlayClick = useCallback(() => {
    if (segmentPlay) return handleSegmentPlay();
    return handlePlay();
  }, [segmentPlay, handleSegmentPlay, handlePlay]);

  const handleDownloadAudio = useCallback(async (title: string) => {
    setIsExporting(true);
    try {
      const { top, actualBeatDuration } = getTimingInfo();
      const { actualBeatDuration: scaleBeatDuration } = getScaleTimingInfo();
      const sampleRate = 44100;
      const combinedAbc = buildCombinedAbc();
      const parsed = abcjs.renderAbc("*", combinedAbc, { responsive: 'resize' });
      const visualObj = parsed?.[0];

      if (!visualObj || !(visualObj as any).lines?.length) throw new Error('Could not render ABC for export');

      // 렌더링 시간 추정
      let totalDuration = (visualObj as any).getTotalTime ? (visualObj as any).getTotalTime() : 0;
      if (!totalDuration || isNaN(totalDuration)) {
        const barCount = (combinedAbc.match(/\|/g) || []).length + 1;
        // 스케일과 본 악보 마디 수를 나눠서 계산해야 하지만 대략적으로 합산
        totalDuration = (prependBasePitch ? 16 * scaleBeatDuration : 0) + (barCount * top * actualBeatDuration);
      }
      totalDuration += 2; // 여유분

      const numFrames = Math.max(1, Math.floor(sampleRate * totalDuration));
      if (isNaN(numFrames)) throw new Error('Invalid audio duration calculated');

      const offlineCtx = new OfflineAudioContext(2, numFrames, sampleRate);
      
      (offlineCtx as any).resume = () => Promise.resolve();
      (offlineCtx as any).suspend = () => Promise.resolve();

      const synth = new abcjs.synth.CreateSynth();
      await synth.init({ audioContext: offlineCtx as any, visualObj });
      await synth.prime();

      if (prependMetronome) {
        const metronomeStartTime = prependBasePitch ? 16 * scaleBeatDuration : 0;
        for (let i = 0; i < top; i++) {
          createMetronomeClick(
            offlineCtx,
            metronomeStartTime + i * actualBeatDuration,
            i === 0,
            metronomeFreq
          );
        }
      }

      synth.start();

      const renderedBuffer = await offlineCtx.startRendering();
      const wavBlob = encodeWav(renderedBuffer);

      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `${title || 'score'}_${timestamp}.wav`;
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
  }, [buildCombinedAbc, prependBasePitch, prependMetronome, getTimingInfo, getScaleTimingInfo, metronomeFreq]);

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
          onClick={onPlayClick}
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
