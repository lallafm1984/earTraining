'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ScoreState, ScoreNote, NoteDuration, Accidental, PitchName, TupletType,
  generateAbc, getMeasureCount, getTupletNoteDuration, durationToSixteenths, getSixteenthsPerBar,
  sixteenthsToDuration, getValidTupletTypesForDuration,
} from '@/lib/scoreUtils';

/** 남은 16분음표 수를 표준 쉼표 배열로 채운다 (greedy) */
function fillWithRests(sixteenths: number): NoteDuration[] {
  if (sixteenths <= 0) return [];
  const OPTIONS: [NoteDuration, number][] = [
    ['1', 16], ['2.', 12], ['2', 8], ['4.', 6], ['4', 4], ['8.', 3], ['8', 2], ['16', 1],
  ];
  const result: NoteDuration[] = [];
  let rem = sixteenths;
  for (const [dur, s] of OPTIONS) {
    while (rem >= s) { result.push(dur); rem -= s; }
  }
  return result;
}
import AbcjsRenderer from './AbcjsRenderer';
import {
  Download, Trash2, Undo, FileAudio, Save, FolderOpen, X,
  Keyboard, Wand2, ChevronDown, ChevronUp, Music2, Settings2,
  RefreshCw, Plus, ChevronRight, Sliders, Disc3, Sparkles, Archive,
} from 'lucide-react';
import {
  generateScore, Difficulty, DifficultyCategory, BassDifficulty,
  getDifficultyCategory, BASS_DIFF_LABELS, BASS_DIFF_DESC,
} from '@/lib/scoreGenerator';

// ── SVG → PNG ──────────────────────────────────────────────────
const TARGET_WIDTH = 1920;

function svgToPng(container: HTMLElement, title: string) {
  const svg = container.querySelector('svg');
  if (!svg) { alert('악보 SVG를 찾을 수 없습니다.'); return; }

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const bbox = svg.getBoundingClientRect();
  const srcW = parseFloat(clone.getAttribute('width') || '') || bbox.width || 800;
  const srcH = parseFloat(clone.getAttribute('height') || '') || bbox.height || 400;

  const scale = TARGET_WIDTH / srcW;
  const outW  = TARGET_WIDTH;
  const outH  = Math.round(srcH * scale);

  clone.setAttribute('width',  String(srcW));
  clone.setAttribute('height', String(srcH));
  if (!clone.getAttribute('viewBox')) {
    clone.setAttribute('viewBox', `0 0 ${srcW} ${srcH}`);
  }

  const data = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const img  = new Image();

  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width  = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, 0, 0, outW, outH);
    URL.revokeObjectURL(url);

    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `${title || 'score'}_${ts}.png`;
    a.href = canvas.toDataURL('image/png', 1.0);
    a.click();
  };
  img.onerror = () => { URL.revokeObjectURL(url); alert('이미지 변환에 실패했습니다.'); };
  img.src = url;
}

interface SavedScore { id: string; title: string; state: ScoreState; savedAt: string; }
function getSavedScores(): SavedScore[] {
  if (typeof window === 'undefined') return [];
  try { const j = localStorage.getItem('ear-training-scores'); return j ? JSON.parse(j) : []; } catch { return []; }
}
function persistScores(s: SavedScore[]) { localStorage.setItem('ear-training-scores', JSON.stringify(s)); }

const DURATIONS: { value: NoteDuration; label: string }[] = [
  { value: '1',  label: '온' },
  { value: '2',  label: '2분' },
  { value: '4',  label: '4분' },
  { value: '8',  label: '8분' },
  { value: '16', label: '16분' },
];
const ACCIDENTALS: { value: Accidental; label: string }[] = [
  { value: '',  label: '없음' },
  { value: '#', label: '♯' },
  { value: 'b', label: '♭' },
  { value: 'n', label: '♮' },
];
const PITCHES: PitchName[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const PITCH_LABELS: Record<string, string> = {
  C: '도', D: '레', E: '미', F: '파', G: '솔', A: '라', B: '시',
};
const PITCH_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  C: { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' }, // Red
  D: { bg: '#ffedd5', text: '#9a3412', border: '#fed7aa' }, // Orange
  E: { bg: '#fef9c3', text: '#854d0e', border: '#fef08a' }, // Yellow
  F: { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' }, // Green
  G: { bg: '#e0f2fe', text: '#075985', border: '#bae6fd' }, // Sky
  A: { bg: '#e0e7ff', text: '#3730a3', border: '#c7d2fe' }, // Indigo
  B: { bg: '#f3e8ff', text: '#6b21a8', border: '#e9d5ff' }, // Purple
};

const DIFF_CATEGORY_LABELS: Record<DifficultyCategory, string> = {
  beginner: '초급', intermediate: '중급', advanced: '고급',
};
const DIFF_CATEGORY_COLORS: Record<DifficultyCategory, { bg: string; text: string; activeBg: string }> = {
  beginner: { bg: '#ecfdf5', text: '#065f46', activeBg: '#10b981' },
  intermediate: { bg: '#fef9c3', text: '#854d0e', activeBg: '#f59e0b' },
  advanced: { bg: '#fce7f3', text: '#9d174d', activeBg: '#ec4899' },
};
const ALL_DIFFICULTIES: Difficulty[] = [
  'beginner_1', 'beginner_2', 'beginner_3',
  'intermediate_1', 'intermediate_2', 'intermediate_3',
  'advanced_1', 'advanced_2', 'advanced_3',
];
const DIFF_LABELS: Record<Difficulty, string> = {
  beginner_1: '초급 1', beginner_2: '초급 2', beginner_3: '초급 3',
  intermediate_1: '중급 1', intermediate_2: '중급 2', intermediate_3: '중급 3',
  advanced_1: '고급 1', advanced_2: '고급 2', advanced_3: '고급 3',
};
const DIFF_DESC: Record<Difficulty, string> = {
  beginner_1: '온음표 · 2분음표',
  beginner_2: '4분음표 · 점2분 · 쉼표',
  beginner_3: '8분음표 · 8분쉼표',
  intermediate_1: '점4분음표',
  intermediate_2: '붙임줄 · 당김음',
  intermediate_3: '16분음표 · 16분쉼표',
  advanced_1: '점8분음표',
  advanced_2: '임시표 (♯ · ♭ · ♮)',
  advanced_3: '셋잇단음표',
};

// ── 바텀시트 오버레이 ──
function BottomSheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] md:hidden" style={{ WebkitTapHighlightColor: 'transparent' }}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-2xl flex flex-col"
        style={{
          background: 'var(--surface)',
          maxHeight: '85dvh',
          paddingBottom: 'env(safe-area-inset-bottom)',
          animation: 'slideUp 0.25s ease-out',
        }}
      >
        {/* 핸들 바 */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
        </div>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 pb-3">
          <h3 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform"
            style={{ background: 'var(--background)', color: 'var(--muted)' }}
          >
            <X size={16} />
          </button>
        </div>
        {/* 컨텐츠 */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── 섹션 카드 ──
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl overflow-hidden ${className}`}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {children}
    </div>
  );
}

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2.5"
      style={{ background: 'var(--background)', borderBottom: '1px solid var(--border)' }}
    >
      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{title}</span>
      {children}
    </div>
  );
}

// ── 작은 설정 칩 (모바일 FAB 옆 컨텍스트 표시) ──
function SettingChip({ label }: { label: string }) {
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: 'var(--primary)18', color: 'var(--primary)' }}
    >
      {label}
    </span>
  );
}

export default function ScoreEditor() {
  const [state, setState] = useState<ScoreState>({
    title: '새 악보', keySignature: 'C', timeSignature: '4/4', tempo: 80, notes: [],
  });
  const [duration, setDuration]     = useState<NoteDuration>('4');
  const [accidental, setAccidental] = useState<Accidental>('');
  const [octave, setOctave]         = useState(4);
  const [tie, setTie]               = useState(false);
  const [tuplet, setTuplet]         = useState<TupletType>('');
  const [tupletCounter, setTupletCounter] = useState(0);
  const [activeStaff, setActiveStaff] = useState<'treble' | 'bass'>('treble');
  const [selectedNote, setSelectedNote] = useState<{ id: string; staff: 'treble' | 'bass' } | null>(null);
  /** 수정 모드에서 Tie로 잇기할 때, 첫 음표(이음 시작점). 다음 악보 클릭으로 끝점 지정 */
  const [pendingTieFrom, setPendingTieFrom] = useState<{ id: string; staff: 'treble' | 'bass' } | null>(null);

  // 재생 옵션
  const [prependBasePitch, setPrependBasePitch] = useState(false);
  const [prependMetronome, setPrependMetronome] = useState(false);
  const [scaleTempo, setScaleTempo]             = useState(120);
  const [metronomeFreq, setMetronomeFreq]       = useState(1000);
  const [examMode, setExamMode]                 = useState(false);
  const [examWaitSeconds, setExamWaitSeconds]   = useState(3);

  // 패널
  const [showSavedList, setShowSavedList]   = useState(false);
  const [previewScore, setPreviewScore]     = useState<SavedScore | null>(null);
  const [paletteOpen, setPaletteOpen]       = useState(true);

  // 자동생성
  const [genDifficulty, setGenDifficulty] = useState<Difficulty>('beginner_1');
  const [genCategory, setGenCategory]     = useState<DifficultyCategory>('beginner');
  const [genBassDifficulty, setGenBassDifficulty] = useState<BassDifficulty>('bass_1');
  const [genMeasures, setGenMeasures]     = useState(4);
  const genForce4Bars = true;
  const [savedScores, setSavedScores]     = useState<SavedScore[]>([]);

  // 모바일 바텀시트
  const [mobileSheet, setMobileSheet] = useState<'settings' | 'playback' | 'generate' | 'saved' | null>(null);

  // 모바일 하단 팔레트 서브메뉴
  const [mobileSubMenu, setMobileSubMenu] = useState<'duration' | 'accidental' | 'octave' | 'tie' | 'tuplet' | null>(null);

  const scoreRef        = useRef<HTMLDivElement>(null);
  const previewScoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSavedScores(getSavedScores()); }, []);

  const curNotes = state.useGrandStaff && activeStaff === 'bass' ? (state.bassNotes || []) : state.notes;

  // ── 모든 핸들러 (비즈니스 로직 100% 동일) ──────────────────────────

  const handleSelectNote = (id: string, staff: 'treble' | 'bass') => {
    const arr = staff === 'bass' ? (state.bassNotes || []) : state.notes;
    const note = arr.find(n => n.id === id);
    if (!note) return;
    setSelectedNote({ id, staff });
    setActiveStaff(staff);
    if (note.pitch !== 'rest') {
      setOctave(note.octave);
      setAccidental(note.accidental);
    }
    setDuration(note.duration);
    setTie(note.tie ?? false);
    setTuplet((note.tuplet as TupletType) || '');
    setTupletCounter(0);
  };

  const handleDeselect = () => {
    setSelectedNote(null);
    setPendingTieFrom(null);
  };

  const handleTieButtonClick = () => {
    if (!selectedNote) {
      setTie(v => !v);
      return;
    }
    if (pendingTieFrom?.id === selectedNote.id) {
      setPendingTieFrom(null);
      return;
    }
    setPendingTieFrom({ id: selectedNote.id, staff: selectedNote.staff });
  };

  const handleTupletChange = (newTuplet: TupletType) => {
    if (!selectedNote) {
      setTuplet(newTuplet);
      setTupletCounter(0);
      return;
    }

    setTuplet(newTuplet);
    setTupletCounter(0);

    const isBass = selectedNote.staff === 'bass';

    setState(p => {
      const pArr = isBass ? (p.bassNotes || []) : p.notes;
      const pIdx = pArr.findIndex(n => n.id === selectedNote.id);
      if (pIdx < 0) return p;

      const newArr = [...pArr];
      const target = newArr[pIdx];

      const oldN = target.tuplet ? parseInt(target.tuplet, 10) : 0;
      const newN = newTuplet  ? parseInt(newTuplet, 10) : 0;
      const spanDur = target.tupletSpan || target.duration;
      const isRest = target.pitch === 'rest';

      if (newTuplet === '') {
        const { tuplet: _t, tupletSpan: _s, tupletNoteDur: _d, ...rest } = target;
        newArr[pIdx] = { ...rest };
        if (!isRest && oldN > 1) {
          newArr.splice(pIdx + 1, oldN - 1);
        }
      } else {
        const tupletNoteDur = getTupletNoteDuration(newTuplet, spanDur);
        const noteDur = sixteenthsToDuration(tupletNoteDur);

        newArr[pIdx] = { ...target, tuplet: newTuplet, tupletSpan: spanDur, tupletNoteDur };

        if (!isRest) {
          const makeNote = (): ScoreNote => ({
            id: Math.random().toString(36).substr(2, 9),
            pitch: target.pitch,
            octave: target.octave,
            accidental: target.accidental,
            duration: noteDur,
            tie: false,
          });

          if (oldN === 0) {
            const added = Array.from({ length: newN - 1 }, makeNote);
            newArr.splice(pIdx + 1, 0, ...added);
          } else if (newN > oldN) {
            const added = Array.from({ length: newN - oldN }, makeNote);
            newArr.splice(pIdx + oldN, 0, ...added);
          } else if (newN < oldN) {
            newArr.splice(pIdx + newN, oldN - newN);
          }
        }
      }

      return { ...p, ...(isBass ? { bassNotes: newArr } : { notes: newArr }) };
    });
  };

  const handleModifyNotePitch = (pitch: PitchName) => {
    if (!selectedNote) return;
    const isBass = selectedNote.staff === 'bass';

    const arr = isBass ? (state.bassNotes || []) : state.notes;
    const idx = arr.findIndex(n => n.id === selectedNote.id);
    if (idx < 0) return;

    const oldNote = arr[idx];
    const oldS = durationToSixteenths(oldNote.duration);
    const newS = durationToSixteenths(duration); // 현재 팔레트 duration 적용
    const barLen = getSixteenthsPerBar(state.timeSignature);

    // 마디 경계 계산
    let noteAbsPos = 0;
    for (let i = 0; i < idx; i++) noteAbsPos += durationToSixteenths(arr[i].duration);
    const noteStartInBar = noteAbsPos % barLen;
    const measureEndAbs = noteAbsPos - noteStartInBar + barLen;
    const spaceInMeasure = measureEndAbs - noteAbsPos;

    if (newS > spaceInMeasure) return; // 마디 초과 불가

    // 룰 5: 길어질 경우 우측에서 충분한 박자를 빌릴 수 있는지 확인
    if (newS > oldS) {
      const needed = newS - oldS;
      let available = 0;
      let rightPos = noteAbsPos + oldS;
      for (let i = idx + 1; i < arr.length; i++) {
        if (rightPos >= measureEndAbs) break;
        available += durationToSixteenths(arr[i].duration);
        rightPos += durationToSixteenths(arr[i].duration);
        if (available >= needed) break;
      }
      if (available < needed) return; // 룰 5: 수정 불가
    }

    const makeRestNote = (rd: NoteDuration): ScoreNote => ({
      id: Math.random().toString(36).substr(2, 9),
      pitch: 'rest' as PitchName, octave: 4, duration: rd,
      accidental: '' as Accidental, tie: false,
    });

    // 새 배열 계산
    const newArr = [...arr];
    newArr[idx] = {
      ...arr[idx],
      pitch,
      duration,
      octave: pitch === 'rest' ? 4 : octave,
      accidental: pitch === 'rest' ? '' as Accidental : accidental,
    };

    if (newS < oldS) {
      // 룰 3: 짧아질 경우 → 우측에 쉼표 삽입
      const freed = oldS - newS;
      const rests = fillWithRests(freed).map(makeRestNote);
      newArr.splice(idx + 1, 0, ...rests);
    } else if (newS > oldS) {
      // 룰 4: 길어질 경우 → 우측에서 박자 차용 (같은 마디 내에서만)
      const needed = newS - oldS;
      let remaining = needed;
      let removeCount = 0;
      let leftoverRests: ScoreNote[] = [];
      let rightPos = noteAbsPos + oldS;

      for (let i = idx + 1; i < newArr.length; i++) {
        if (rightPos >= measureEndAbs) break;
        const rightS = durationToSixteenths(newArr[i].duration);
        if (rightS <= remaining) {
          removeCount++;
          remaining -= rightS;
          rightPos += rightS;
          if (remaining === 0) break;
        } else {
          removeCount++;
          leftoverRests = fillWithRests(rightS - remaining).map(makeRestNote);
          break;
        }
      }
      if (removeCount > 0) {
        newArr.splice(idx + 1, removeCount);
        if (leftoverRests.length > 0) newArr.splice(idx + 1, 0, ...leftoverRests);
      }
    }

    // 룰 6: 다음 음표로 선택 이동
    const nextNote = newArr[idx + 1] ?? null;

    setState(p => ({ ...p, ...(isBass ? { bassNotes: newArr } : { notes: newArr }) }));

    if (nextNote) {
      setSelectedNote({ id: nextNote.id, staff: selectedNote.staff });
      setDuration(nextNote.duration);
      if (nextNote.pitch !== 'rest') {
        setOctave(nextNote.octave);
        setAccidental(nextNote.accidental);
      }
      setTie(nextNote.tie ?? false);
      setTuplet((nextNote.tuplet as TupletType) || '');
      setTupletCounter(0);
    } else {
      setSelectedNote(null);
    }
  };

  // 음표 길이 버튼: 팔레트 UI 상태만 변경 (악보 반영은 음이름/쉼표 클릭 시)
  const handleDurationChange = (d: NoteDuration) => {
    setDuration(d);
  };

  const handleOctaveChange = (newOctave: number) => {
    setOctave(newOctave);
    if (!selectedNote) return;
    const isBass = selectedNote.staff === 'bass';
    setState(p => {
      const arr = isBass ? (p.bassNotes || []) : p.notes;
      return { ...p, ...(isBass ? { bassNotes: arr.map(n => n.id === selectedNote.id ? { ...n, octave: newOctave } : n) }
                                : { notes: arr.map(n => n.id === selectedNote.id ? { ...n, octave: newOctave } : n) }) };
    });
  };

  const handleAccidentalChange = (acc: Accidental) => {
    setAccidental(acc);
    if (!selectedNote) return;
    const isBass = selectedNote.staff === 'bass';
    setState(p => {
      const arr = isBass ? (p.bassNotes || []) : p.notes;
      return { ...p, ...(isBass ? { bassNotes: arr.map(n => n.id === selectedNote.id ? { ...n, accidental: acc } : n) }
                                : { notes: arr.map(n => n.id === selectedNote.id ? { ...n, accidental: acc } : n) }) };
    });
  };

  const handleAddNote = (pitch: PitchName) => {
    setPendingTieFrom(null);
    if (selectedNote) { handleModifyNotePitch(pitch); return; }
    const isRest = pitch === 'rest';
    const tupletCount = tuplet ? parseInt(tuplet, 10) : 0;
    const isFirstInTuplet = tuplet && !isRest && tupletCounter === 0;
    const newNote: ScoreNote = {
      id: Math.random().toString(36).substr(2, 9),
      pitch, octave: isRest ? 4 : octave,
      accidental: isRest ? '' : accidental,
      duration, tie: isRest ? false : tie,
      tuplet: isFirstInTuplet ? tuplet : undefined,
      tupletSpan: isFirstInTuplet ? duration : undefined,
      tupletNoteDur: isFirstInTuplet ? getTupletNoteDuration(tuplet, duration) : undefined,
    };
    const isBass = state.useGrandStaff && activeStaff === 'bass';
    setState(p => {
      const arr = isBass ? (p.bassNotes || []) : p.notes;
      return { ...p, ...(isBass ? { bassNotes: [...arr, newNote] } : { notes: [...arr, newNote] }) };
    });
    if (tuplet && !isRest) {
      const next = tupletCounter + 1;
      if (next >= tupletCount) {
        setTupletCounter(0);
        setTuplet('');
      } else {
        setTupletCounter(next);
      }
    }
  };

  const handleInsertBefore = (index: number, staff: 'treble' | 'bass') => {
    setSelectedNote(null);
    setPendingTieFrom(null);
    setActiveStaff(staff);
    const isBass = staff === 'bass';
    const newNote: ScoreNote = {
      id: Math.random().toString(36).substr(2, 9),
      pitch: 'C', octave, accidental, duration, tie: false,
    };
    setState(p => {
      const arr = isBass ? (p.bassNotes || []) : p.notes;
      const next = [...arr.slice(0, index), newNote, ...arr.slice(index)];
      return { ...p, ...(isBass ? { bassNotes: next } : { notes: next }) };
    });
    setSelectedNote({ id: newNote.id, staff });
    setOctave(octave); setAccidental(accidental); setDuration(duration);
  };

  const handleDeleteNote = (id: string, staff: 'treble' | 'bass') => {
    const isBass = staff === 'bass';
    setState(p => {
      const arr = isBass ? (p.bassNotes || []) : p.notes;
      return { ...p, ...(isBass ? { bassNotes: arr.filter(n => n.id !== id) }
                                : { notes: arr.filter(n => n.id !== id) }) };
    });
    if (selectedNote?.id === id) setSelectedNote(null);
    setPendingTieFrom(p => (p?.id === id ? null : p));
  };

  const handleAbcNoteClick = useCallback((noteIndex: number, voice: 'treble' | 'bass') => {
    const arr = voice === 'bass' ? (state.bassNotes || []) : state.notes;
    if (noteIndex >= arr.length) return;
    const clickedNote = arr[noteIndex];

    if (pendingTieFrom) {
      if (voice !== pendingTieFrom.staff) {
        alert('같은 오선의 음표만 잇을 수 있습니다.');
        return;
      }
      const fromArr = arr;
      const fromIdx = fromArr.findIndex(n => n.id === pendingTieFrom.id);
      if (fromIdx < 0) {
        setPendingTieFrom(null);
        return;
      }
      if (clickedNote.id === pendingTieFrom.id) {
        handleSelectNote(clickedNote.id, voice);
        setPaletteOpen(true);
        return;
      }
      if (fromIdx + 1 !== noteIndex) {
        alert('바로 다음 음표만 잇을 수 있습니다.');
        return;
      }
      const fromNote = fromArr[fromIdx];
      const toNote = clickedNote;
      if (fromNote.pitch === 'rest' || toNote.pitch === 'rest') {
        alert('쉼표에는 잇기를 할 수 없습니다.');
        return;
      }
      const isBass = voice === 'bass';
      setState(p => {
        const pArr = isBass ? (p.bassNotes || []) : p.notes;
        const pIdx = pArr.findIndex(n => n.id === pendingTieFrom.id);
        if (pIdx < 0) return p;
        const next = [...pArr];
        next[pIdx] = { ...next[pIdx], tie: true };
        return { ...p, ...(isBass ? { bassNotes: next } : { notes: next }) };
      });
      setPendingTieFrom(null);
      setSelectedNote({ id: clickedNote.id, staff: voice });
      setTie(false);
      setPaletteOpen(true);
      return;
    }

    handleSelectNote(clickedNote.id, voice);
    setPaletteOpen(true);
  }, [state.notes, state.bassNotes, pendingTieFrom]);

  const selectedNoteAbcInfo = (() => {
    if (!selectedNote) return null;
    const arr = selectedNote.staff === 'bass' ? (state.bassNotes || []) : state.notes;
    const index = arr.findIndex(n => n.id === selectedNote.id);
    if (index < 0) return null;
    return { index, voice: selectedNote.staff };
  })();

  const handleUndo = () => {
    setPendingTieFrom(null);
    const isBass = state.useGrandStaff && activeStaff === 'bass';
    setState(p => isBass
      ? { ...p, bassNotes: (p.bassNotes || []).slice(0, -1) }
      : { ...p, notes: p.notes.slice(0, -1) });
  };

  const handleClear = () => {
    const isBass = state.useGrandStaff && activeStaff === 'bass';
    if (confirm(`${isBass ? '낮은' : '높은'}음자리의 모든 음표를 지우시겠습니까?`)) {
      setPendingTieFrom(null);
      setSelectedNote(null);
      setState(p => isBass ? { ...p, bassNotes: [] } : { ...p, notes: [] });
    }
  };

  const handleGenerate = useCallback(() => {
    window.dispatchEvent(new Event('abcjs-force-stop'));
    const result = generateScore({
      keySignature: state.keySignature, timeSignature: state.timeSignature,
      difficulty: genDifficulty, measures: genMeasures,
      useGrandStaff: state.useGrandStaff ?? false,
      bassDifficulty: (state.useGrandStaff ?? false) ? genBassDifficulty : undefined,
    });
    setPendingTieFrom(null);
    setSelectedNote(null);
    setState(p => ({ ...p, notes: result.trebleNotes, bassNotes: result.bassNotes, barsPerStaff: genForce4Bars ? 4 : undefined }));
    setMobileSheet(null);
  }, [state.keySignature, state.timeSignature, state.useGrandStaff, genDifficulty, genMeasures, genBassDifficulty, genForce4Bars]);

  const handleSave = useCallback(() => {
    const scores = getSavedScores();
    scores.unshift({ id: Date.now().toString(), title: state.title || '제목 없음', state: { ...state }, savedAt: new Date().toISOString() });
    persistScores(scores); setSavedScores(scores); alert('악보가 저장되었습니다.');
  }, [state]);

  const handleLoadScore = useCallback((saved: SavedScore) => {
    setPendingTieFrom(null);
    setSelectedNote(null);
    setState(saved.state); setShowSavedList(false); setPreviewScore(null); setMobileSheet(null);
  }, []);

  const handleDeleteSaved = useCallback((id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    const scores = getSavedScores().filter(s => s.id !== id);
    persistScores(scores); setSavedScores(scores);
    if (previewScore?.id === id) setPreviewScore(null);
  }, [previewScore]);

  const handlePreviewDownloadImage = useCallback((saved: SavedScore) => {
    setPreviewScore(saved);
    setTimeout(() => { if (previewScoreRef.current) svgToPng(previewScoreRef.current, saved.title); }, 500);
  }, []);

  const handleInsertAfterSelected = useCallback((pitch: PitchName) => {
    setPendingTieFrom(null);
    if (!selectedNote) return;
    const isBass = selectedNote.staff === 'bass';
    const isRest = pitch === 'rest';
    const tupletCount = tuplet ? parseInt(tuplet, 10) : 0;
    const isFirstInTuplet = tuplet && !isRest && tupletCounter === 0;

    const newNote: ScoreNote = {
      id: Math.random().toString(36).substr(2, 9),
      pitch,
      octave: isRest ? 4 : octave,
      accidental: isRest ? '' as Accidental : accidental,
      duration,
      tie: isRest ? false : tie,
      tuplet: isFirstInTuplet ? tuplet : undefined,
      tupletSpan: isFirstInTuplet ? duration : undefined,
      tupletNoteDur: isFirstInTuplet ? getTupletNoteDuration(tuplet, duration) : undefined,
    };
    setState(p => {
      const arr = isBass ? (p.bassNotes || []) : p.notes;
      const idx = arr.findIndex(n => n.id === selectedNote.id);
      if (idx < 0) return p;
      const newArr = [...arr];
      newArr.splice(idx + 1, 0, newNote);
      return { ...p, ...(isBass ? { bassNotes: newArr } : { notes: newArr }) };
    });
    setSelectedNote({ id: newNote.id, staff: selectedNote.staff });

    if (tuplet && !isRest) {
      const next = tupletCounter + 1;
      if (next >= tupletCount) {
        setTupletCounter(0);
        setTuplet('');
      } else {
        setTupletCounter(next);
      }
    }
  }, [selectedNote, octave, accidental, duration, tie, tuplet, tupletCounter]);

  // 키보드 단축키
  const handleAddNoteRef = useRef(handleAddNote);
  handleAddNoteRef.current = handleAddNote;
  const handleInsertAfterRef = useRef(handleInsertAfterSelected);
  handleInsertAfterRef.current = handleInsertAfterSelected;
  const selectedNoteRef = useRef(selectedNote);
  selectedNoteRef.current = selectedNote;
  const pendingTieFromRef = useRef(pendingTieFrom);
  pendingTieFromRef.current = pendingTieFrom;
  useEffect(() => {
    const MAP: Record<string, PitchName> = { '1':'C','2':'D','3':'E','4':'F','5':'G','6':'A','7':'B' };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const p = MAP[e.key];
      if (p) {
        e.preventDefault();
        if (selectedNoteRef.current) {
          handleInsertAfterRef.current(p);
        } else {
          handleAddNoteRef.current(p);
        }
        return;
      }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setOctave(v => Math.min(6, v + 1)); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setOctave(v => Math.max(2, v - 1)); }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (pendingTieFromRef.current) setPendingTieFrom(null);
        else setSelectedNote(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const abcString = generateAbc(state, true);
  const noteCount = state.notes.length + (state.bassNotes?.length ?? 0);
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);

  const DUR_LABEL: Record<NoteDuration, string> = {
    '1':'온','1.':'점온','2':'2분','4':'4분','8':'8분','16':'16분','2.':'점2','4.':'점4','8.':'점8',
  };

  const formatNoteLabel = (n: ScoreNote) => {
    if (n.pitch === 'rest') return '쉼';
    const acc = n.accidental === '#' ? '♯' : n.accidental === 'b' ? '♭' : n.accidental === 'n' ? '♮' : '';
    return `${n.pitch}${acc}${n.octave}`;
  };

  // ── 팔레트 내부 로직 (점음표) ──
  const baseDur = (duration.endsWith('.') ? duration.slice(0, -1) : duration) as NoteDuration;
  const hasDot = duration.endsWith('.');
  const dotDisabled = baseDur === '16';

  const handleBaseDurationClick = (base: NoteDuration) => {
    const newDur = (hasDot && base !== '16') ? `${base}.` as NoteDuration : base;
    handleDurationChange(newDur);
  };
  const handleDotToggle = () => {
    if (dotDisabled) return;
    if (hasDot) handleDurationChange(baseDur);
    else handleDurationChange(`${baseDur}.` as NoteDuration);
  };

  // ── 렌더링 ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col md:flex-row gap-0 md:gap-5 min-h-full md:p-5">

      {/* ═══════════════════════════════════════════════
          모바일: 설정 툴바 (상단 고정, 간결한 칩 형태)
          ═══════════════════════════════════════════════ */}
      {/* 상단 툴바: 4버튼 균등 배치 (360px 기준, 스크롤 없음) */}
      <div
        className="md:hidden grid grid-cols-4 gap-1.5 px-2 py-2 sticky top-0 z-[60]"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      >
        <button
          onClick={() => setMobileSheet('settings')}
          className="flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-[11px] font-semibold active:scale-95 transition-transform"
          style={{ background: 'var(--primary)18', color: 'var(--primary)', WebkitTapHighlightColor: 'transparent' }}
        >
          <Sliders size={15} />
          <span>{state.keySignature}·{state.timeSignature}</span>
        </button>
        <button
          onClick={() => setMobileSheet('playback')}
          className="flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-[11px] font-semibold active:scale-95 transition-transform"
          style={{ background: '#EEF2FF', color: 'var(--primary)', WebkitTapHighlightColor: 'transparent' }}
        >
          <Disc3 size={15} />
          <span>재생옵션</span>
        </button>
        <button
          onClick={() => setMobileSheet('generate')}
          className="flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-[11px] font-semibold active:scale-95 transition-transform"
          style={{ background: '#FEF3C7', color: '#92400e', WebkitTapHighlightColor: 'transparent' }}
        >
          <Sparkles size={15} />
          <span>자동생성</span>
        </button>
        <button
          onClick={() => setMobileSheet('saved')}
          className="flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-[11px] font-semibold active:scale-95 transition-transform"
          style={{ background: 'var(--background)', color: 'var(--muted)', border: '1px solid var(--border)', WebkitTapHighlightColor: 'transparent' }}
        >
          <Archive size={15} />
          <span>저장</span>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════
          모바일: 바텀시트 모달들
          ═══════════════════════════════════════════════ */}

      {/* 악보 설정 시트 */}
      <BottomSheet open={mobileSheet === 'settings'} onClose={() => setMobileSheet(null)} title="악보 설정">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>제목</label>
            <input type="text" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              value={state.title} onChange={e => setState(p => ({ ...p, title: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>조성</label>
              <select className="w-full rounded-xl px-2 py-2.5 text-sm"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                value={state.keySignature} onChange={e => setState(p => ({ ...p, keySignature: e.target.value }))}>
                <optgroup label="장조">
                  {['C','G','D','A','F','Bb','Eb'].map(k => <option key={k} value={k}>{k} Major</option>)}
                </optgroup>
                <optgroup label="단조">
                  {['Am','Em','Bm','F#m','Dm','Gm','Cm'].map(k => <option key={k} value={k}>{k}</option>)}
                </optgroup>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>박자</label>
              <select className="w-full rounded-xl px-2 py-2.5 text-sm"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                value={state.timeSignature} onChange={e => setState(p => ({ ...p, timeSignature: e.target.value }))}>
                {['4/4','3/4','2/4','6/8','9/8'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>BPM</label>
              <input type="text" className="w-full rounded-xl px-2 py-2.5 text-sm"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                value={state.tempo || ''}
                onChange={e => { const val = e.target.value; if (val === '') setState(p => ({ ...p, tempo: 0 })); else { const n = parseInt(val); if (!isNaN(n)) setState(p => ({ ...p, tempo: n })); } }}
                onBlur={e => { const n = parseInt(e.target.value); if (isNaN(n) || n < 40) setState(p => ({ ...p, tempo: 40 })); else if (n > 240) setState(p => ({ ...p, tempo: 240 })); }}
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={state.useGrandStaff ?? false}
                  onChange={e => setState(p => ({ ...p, useGrandStaff: e.target.checked, bassNotes: p.bassNotes || [] }))}
                  className="w-5 h-5 rounded" style={{ accentColor: 'var(--primary)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>큰보표</span>
              </label>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* 재생 옵션 시트 */}
      <BottomSheet open={mobileSheet === 'playback'} onClose={() => setMobileSheet(null)} title="재생 옵션">
        <div className="flex flex-col gap-5">
          <label className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>스케일 (조성 음계)</span>
            <input type="checkbox" checked={prependBasePitch} onChange={e => setPrependBasePitch(e.target.checked)}
              className="w-5 h-5 rounded" style={{ accentColor: 'var(--primary)' }} />
          </label>
          {prependBasePitch && (
            <div className="flex items-center gap-2 pl-4">
              <span className="text-xs" style={{ color: 'var(--muted)' }}>스케일 BPM</span>
              <input type="text" value={scaleTempo || ''}
                onChange={e => { const v = e.target.value; if (v === '') setScaleTempo(0); else { const n = parseInt(v); if (!isNaN(n)) setScaleTempo(n); } }}
                onBlur={e => { const n = parseInt(e.target.value); if (isNaN(n) || n < 40) setScaleTempo(40); else if (n > 300) setScaleTempo(300); }}
                className="w-20 px-3 py-2 rounded-xl text-sm text-center font-semibold"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              />
            </div>
          )}
          <label className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>메트로놈</span>
            <input type="checkbox" checked={prependMetronome} onChange={e => setPrependMetronome(e.target.checked)}
              className="w-5 h-5 rounded" style={{ accentColor: 'var(--primary)' }} />
          </label>
          {prependMetronome && (
            <div className="flex items-center gap-2 pl-4">
              <span className="text-xs" style={{ color: 'var(--muted)' }}>클릭 주파수 (Hz)</span>
              <input type="text" value={metronomeFreq || ''}
                onChange={e => { const v = e.target.value; if (v === '') setMetronomeFreq(0); else { const n = parseInt(v); if (!isNaN(n)) setMetronomeFreq(n); } }}
                onBlur={e => { const n = parseInt(e.target.value); if (isNaN(n) || n < 200) setMetronomeFreq(200); else if (n > 4000) setMetronomeFreq(4000); }}
                className="w-20 px-3 py-2 rounded-xl text-sm text-center font-semibold"
                style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
              />
            </div>
          )}
          <div
            className="rounded-2xl p-4"
            style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}
          >
            <label className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold" style={{ color: '#92400e' }}>시험 모드</span>
              <input type="checkbox" checked={examMode}
                onChange={e => { setExamMode(e.target.checked); if (e.target.checked) { setPrependBasePitch(true); setPrependMetronome(true); } }}
                className="w-5 h-5 rounded" style={{ accentColor: '#f59e0b' }} />
            </label>
            {examMode && (
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: '#92400e' }}>구간 대기 시간</span>
                <input type="text" value={examWaitSeconds}
                  onChange={e => { const v = e.target.value; if (v === '') setExamWaitSeconds(0); else { const n = parseInt(v); if (!isNaN(n)) setExamWaitSeconds(n); } }}
                  onBlur={e => { const n = parseInt(e.target.value); if (isNaN(n) || n < 0) setExamWaitSeconds(0); else if (n > 30) setExamWaitSeconds(30); }}
                  className="w-14 px-2 py-1.5 rounded-lg text-sm text-center font-bold"
                  style={{ background: 'white', border: '1px solid #FDE68A', color: '#92400e' }}
                />
                <span className="text-xs" style={{ color: '#92400e' }}>초</span>
              </div>
            )}
          </div>
        </div>
      </BottomSheet>

      {/* 자동 생성 시트 */}
      <BottomSheet open={mobileSheet === 'generate'} onClose={() => setMobileSheet(null)} title="자동 생성">
        <div className="flex flex-col gap-4">
          {/* 선율 난이도 — 카테고리별 카드 */}
          <div>
            <p className="text-xs font-bold mb-2" style={{ color: 'var(--muted)' }}>선율 난이도</p>
            {(['beginner','intermediate','advanced'] as DifficultyCategory[]).map(cat => {
              const colors = DIFF_CATEGORY_COLORS[cat];
              const subLevels = ALL_DIFFICULTIES.filter(d => getDifficultyCategory(d) === cat);
              return (
                <div key={cat} className="mb-2">
                  <div className="inline-block px-2.5 py-1 rounded-lg text-xs font-bold mb-1.5"
                    style={{ background: colors.bg, color: colors.text }}>
                    {DIFF_CATEGORY_LABELS[cat]}
                  </div>
                  <div className="flex gap-2">
                    {subLevels.map(d => {
                      const isActive = genDifficulty === d;
                      return (
                        <button key={d} onClick={() => { setGenCategory(getDifficultyCategory(d)); setGenDifficulty(d); }}
                          className="flex-1 flex flex-col items-center py-2.5 px-1 rounded-xl text-center transition-all active:scale-95"
                          style={{
                            background: isActive ? colors.activeBg : colors.bg,
                            border: `1px solid ${isActive ? colors.activeBg : colors.text + '28'}`,
                            boxShadow: isActive ? `0 2px 5px ${colors.activeBg}59` : 'none',
                            WebkitTapHighlightColor: 'transparent',
                          }}>
                          <span className="text-xs font-bold" style={{ color: isActive ? '#fff' : colors.text }}>
                            {d.split('_')[1]}단계
                          </span>
                          <span className="text-[10px] leading-tight mt-0.5" style={{ color: isActive ? 'rgba(255,255,255,0.85)' : colors.text + 'cc' }}>
                            {DIFF_DESC[d]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {/* 베이스 난이도 */}
          {(state.useGrandStaff ?? false) && (
            <div>
              <p className="text-xs font-bold mb-2" style={{ color: '#7c3aed' }}>베이스 난이도</p>
              <div className="flex gap-2">
                {(['bass_1','bass_2','bass_3','bass_4'] as BassDifficulty[]).map(bd => {
                  const isActive = genBassDifficulty === bd;
                  return (
                    <button key={bd} onClick={() => setGenBassDifficulty(bd)}
                      className="flex-1 flex flex-col items-center py-2.5 px-1 rounded-xl text-center transition-all active:scale-95"
                      style={{
                        background: isActive ? '#7c3aed' : '#f3e8ff',
                        border: `1px solid ${isActive ? '#7c3aed' : '#7c3aed28'}`,
                        boxShadow: isActive ? '0 2px 5px rgba(124,58,237,0.35)' : 'none',
                        WebkitTapHighlightColor: 'transparent',
                      }}>
                      <span className="text-xs font-bold" style={{ color: isActive ? '#fff' : '#7c3aed' }}>
                        {BASS_DIFF_LABELS[bd]}
                      </span>
                      <span className="text-[10px] leading-tight mt-0.5" style={{ color: isActive ? 'rgba(255,255,255,0.85)' : '#7c3aedcc' }}>
                        {BASS_DIFF_DESC[bd]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* 마디 수 */}
          <div>
            <p className="text-xs font-bold mb-2" style={{ color: 'var(--muted)' }}>마디 수</p>
            <div className="flex gap-2">
              {[4, 8, 12, 16].map(n => {
                const isActive = genMeasures === n;
                return (
                  <button key={n} onClick={() => setGenMeasures(n)}
                    className="flex-1 flex flex-col items-center py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
                    style={{
                      background: isActive ? '#6366f1' : '#f1f5f9',
                      border: `1px solid ${isActive ? '#6366f1' : '#e2e8f0'}`,
                      boxShadow: isActive ? '0 2px 5px rgba(99,102,241,0.3)' : 'none',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                    <span className="font-bold" style={{ color: isActive ? '#fff' : '#334155' }}>{n}</span>
                    <span className="text-[10px]" style={{ color: isActive ? 'rgba(255,255,255,0.75)' : '#94a3b8' }}>마디</span>
                  </button>
                );
              })}
            </div>
          </div>
          <button onClick={handleGenerate}
            className="w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 active:scale-95 transition-transform"
            style={{ background: 'var(--primary)', WebkitTapHighlightColor: 'transparent' }}>
            <RefreshCw size={15} /> 생성하기
          </button>
        </div>
      </BottomSheet>

      {/* 저장/불러오기 시트 */}
      <BottomSheet open={mobileSheet === 'saved'} onClose={() => setMobileSheet(null)} title="악보 관리">
        <div className="flex flex-col gap-3">
          <button onClick={handleSave}
            className="w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 active:scale-95 transition-transform"
            style={{ background: 'var(--success)', WebkitTapHighlightColor: 'transparent' }}>
            <Save size={15} /> 현재 악보 저장
          </button>
          {savedScores.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: 'var(--muted)' }}>저장된 악보가 없습니다.</p>
          ) : (
            <div className="flex flex-col gap-2 mt-2">
              {savedScores.map(s => (
                <div key={s.id} className="rounded-xl p-3" style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--foreground)' }}>{s.title}</p>
                  <p className="text-xs mt-0.5 mb-2" style={{ color: 'var(--muted)' }}>
                    {s.state.keySignature} · {s.state.timeSignature} · {s.state.tempo}BPM · {new Date(s.savedAt).toLocaleDateString('ko-KR')}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => handleLoadScore(s)}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold active:scale-95 transition-transform"
                      style={{ background: 'var(--primary)18', color: 'var(--primary)', WebkitTapHighlightColor: 'transparent' }}>
                      열기
                    </button>
                    <button onClick={() => handlePreviewDownloadImage(s)}
                      className="py-2 px-3 rounded-lg text-xs active:scale-95 transition-transform"
                      style={{ background: '#dcfce7', color: '#16a34a', WebkitTapHighlightColor: 'transparent' }}>
                      <Download size={13} />
                    </button>
                    <button onClick={() => handleDeleteSaved(s.id)}
                      className="py-2 px-3 rounded-lg text-xs active:scale-95 transition-transform"
                      style={{ background: '#fef2f2', color: '#ef4444', WebkitTapHighlightColor: 'transparent' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>

      {/* ═══════════════════════════════════════════════
          PC: 왼쪽 사이드 패널 (기존과 동일)
          ═══════════════════════════════════════════════ */}
      <div className={`hidden md:flex md:w-80 md:shrink-0 flex-col gap-4 md:overflow-y-auto pb-4`}>

        {/* 악보 설정 */}
        <Card>
          <SectionHeader title="악보 설정" />
          <div className="p-4 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>제목</label>
              <input type="text" className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                value={state.title} onChange={e => setState(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>조성</label>
              <select className="w-full border rounded-lg px-2 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-400"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                value={state.keySignature} onChange={e => setState(p => ({ ...p, keySignature: e.target.value }))}>
                <optgroup label="장조">
                  {['C','G','D','A','F','Bb','Eb'].map(k => <option key={k} value={k}>{k} Major</option>)}
                </optgroup>
                <optgroup label="단조">
                  {['Am','Em','Bm','F#m','Dm','Gm','Cm'].map(k => <option key={k} value={k}>{k}</option>)}
                </optgroup>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>박자</label>
              <select className="w-full border rounded-lg px-2 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-400"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                value={state.timeSignature} onChange={e => setState(p => ({ ...p, timeSignature: e.target.value }))}>
                {['4/4','3/4','2/4','6/8','9/8'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>BPM</label>
              <input type="text" className="w-full border rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}
                value={state.tempo || ''}
                onChange={e => { const val = e.target.value; if (val === '') setState(p => ({ ...p, tempo: 0 })); else { const n = parseInt(val); if (!isNaN(n)) setState(p => ({ ...p, tempo: n })); } }}
                onBlur={e => { const n = parseInt(e.target.value); if (isNaN(n) || n < 40) setState(p => ({ ...p, tempo: 40 })); else if (n > 240) setState(p => ({ ...p, tempo: 240 })); }}
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={state.useGrandStaff ?? false}
                  onChange={e => setState(p => ({ ...p, useGrandStaff: e.target.checked, bassNotes: p.bassNotes || [] }))}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400" />
                <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>큰보표</span>
              </label>
            </div>
          </div>
        </Card>

        {/* 재생 옵션 */}
        <Card>
          <SectionHeader title="재생 옵션" />
          <div className="p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={prependBasePitch} onChange={e => setPrependBasePitch(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400" />
                <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>스케일</span>
              </label>
              {prependBasePitch && (
                <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1" style={{ background: '#EEF2FF', border: '1px solid #c7d2fe' }}>
                  <span className="text-xs font-medium" style={{ color: 'var(--primary)' }}>BPM</span>
                  <input type="text" value={scaleTempo || ''}
                    onChange={e => { const v = e.target.value; if (v === '') setScaleTempo(0); else { const n = parseInt(v); if (!isNaN(n)) setScaleTempo(n); } }}
                    onBlur={e => { const n = parseInt(e.target.value); if (isNaN(n) || n < 40) setScaleTempo(40); else if (n > 300) setScaleTempo(300); }}
                    className="w-16 text-sm font-semibold bg-transparent outline-none text-right" style={{ color: 'var(--primary)' }}
                  />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={prependMetronome} onChange={e => setPrependMetronome(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400" />
                <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>메트로놈</span>
              </label>
              {prependMetronome && (
                <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1" style={{ background: '#EEF2FF', border: '1px solid #c7d2fe' }}>
                  <span className="text-xs font-medium" style={{ color: 'var(--primary)' }}>Hz</span>
                  <input type="text" value={metronomeFreq || ''}
                    onChange={e => { const v = e.target.value; if (v === '') setMetronomeFreq(0); else { const n = parseInt(v); if (!isNaN(n)) setMetronomeFreq(n); } }}
                    onBlur={e => { const n = parseInt(e.target.value); if (isNaN(n) || n < 200) setMetronomeFreq(200); else if (n > 4000) setMetronomeFreq(4000); }}
                    className="w-16 text-sm font-semibold bg-transparent outline-none text-right" style={{ color: 'var(--primary)' }}
                  />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={examMode}
                  onChange={e => { setExamMode(e.target.checked); if (e.target.checked) { setPrependBasePitch(true); setPrependMetronome(true); } }}
                  className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400" />
                <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>시험 모드</span>
              </label>
              {examMode && (
                <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1" style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}>
                  <span className="text-xs font-medium" style={{ color: '#92400e' }}>대기(초)</span>
                  <input type="text" value={examWaitSeconds}
                    onChange={e => { const v = e.target.value; if (v === '') setExamWaitSeconds(0); else { const n = parseInt(v); if (!isNaN(n)) setExamWaitSeconds(n); } }}
                    onBlur={e => { const n = parseInt(e.target.value); if (isNaN(n) || n < 0) setExamWaitSeconds(0); else if (n > 30) setExamWaitSeconds(30); }}
                    className="w-10 text-sm font-semibold bg-transparent outline-none text-right" style={{ color: '#92400e' }}
                  />
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* 자동 생성 */}
        <Card>
          <div className="w-full flex items-center gap-2 px-4 py-3">
            <Wand2 size={15} style={{ color: '#f59e0b' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>자동 생성</span>
          </div>
          <div className="px-4 py-4 flex flex-col gap-4" style={{ borderTop: '1px solid var(--border)' }}>
              {/* 선율 난이도 — 카테고리별 카드 */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted)' }}>선율 난이도</p>
                {(['beginner','intermediate','advanced'] as DifficultyCategory[]).map(cat => {
                  const colors = DIFF_CATEGORY_COLORS[cat];
                  const subLevels = ALL_DIFFICULTIES.filter(d => getDifficultyCategory(d) === cat);
                  return (
                    <div key={cat} className="mb-2">
                      <div className="inline-block px-2 py-0.5 rounded-md text-xs font-bold mb-1.5"
                        style={{ background: colors.bg, color: colors.text }}>
                        {DIFF_CATEGORY_LABELS[cat]}
                      </div>
                      <div className="flex gap-1.5">
                        {subLevels.map(d => {
                          const isActive = genDifficulty === d;
                          return (
                            <button key={d} onClick={() => { setGenCategory(getDifficultyCategory(d)); setGenDifficulty(d); }}
                              className="flex-1 flex flex-col items-center py-2 px-1 rounded-lg text-center transition-all"
                              style={{
                                background: isActive ? colors.activeBg : colors.bg,
                                border: `1px solid ${isActive ? colors.activeBg : colors.text + '28'}`,
                                boxShadow: isActive ? `0 2px 5px ${colors.activeBg}59` : 'none',
                              }}>
                              <span className="text-xs font-bold" style={{ color: isActive ? '#fff' : colors.text }}>
                                {d.split('_')[1]}단계
                              </span>
                              <span className="text-[10px] leading-tight mt-0.5" style={{ color: isActive ? 'rgba(255,255,255,0.85)' : colors.text + 'cc' }}>
                                {DIFF_DESC[d]}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* 베이스 난이도 */}
              {(state.useGrandStaff ?? false) && (
                <div>
                  <p className="text-xs font-medium mb-2" style={{ color: '#7c3aed' }}>베이스 난이도</p>
                  <div className="flex gap-1.5">
                    {(['bass_1','bass_2','bass_3','bass_4'] as BassDifficulty[]).map(bd => {
                      const isActive = genBassDifficulty === bd;
                      return (
                        <button key={bd} onClick={() => setGenBassDifficulty(bd)}
                          className="flex-1 flex flex-col items-center py-2 px-1 rounded-lg text-center transition-all"
                          style={{
                            background: isActive ? '#7c3aed' : '#f3e8ff',
                            border: `1px solid ${isActive ? '#7c3aed' : '#7c3aed28'}`,
                            boxShadow: isActive ? '0 2px 5px rgba(124,58,237,0.35)' : 'none',
                          }}>
                          <span className="text-xs font-bold" style={{ color: isActive ? '#fff' : '#7c3aed' }}>
                            {BASS_DIFF_LABELS[bd]}
                          </span>
                          <span className="text-[10px] leading-tight mt-0.5" style={{ color: isActive ? 'rgba(255,255,255,0.85)' : '#7c3aedcc' }}>
                            {BASS_DIFF_DESC[bd]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* 마디 수 */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted)' }}>마디 수</p>
                <div className="flex gap-1.5">
                  {[4, 8, 12, 16].map(n => {
                    const isActive = genMeasures === n;
                    return (
                      <button key={n} onClick={() => setGenMeasures(n)}
                        className="flex-1 flex flex-col items-center py-2 rounded-lg text-sm font-medium transition-all"
                        style={{
                          background: isActive ? '#6366f1' : '#f1f5f9',
                          border: `1px solid ${isActive ? '#6366f1' : '#e2e8f0'}`,
                          boxShadow: isActive ? '0 2px 5px rgba(99,102,241,0.3)' : 'none',
                        }}>
                        <span className="font-bold" style={{ color: isActive ? '#fff' : '#334155' }}>{n}</span>
                        <span className="text-[10px]" style={{ color: isActive ? 'rgba(255,255,255,0.75)' : '#94a3b8' }}>마디</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <button onClick={handleGenerate}
                className="w-full py-2.5 rounded-lg font-semibold text-sm text-white active:scale-[0.98] transition-all shadow flex items-center justify-center gap-2"
                style={{ background: 'var(--primary)' }}>
                <RefreshCw size={15} /> 생성하기
              </button>
            </div>
        </Card>

        {/* 저장/불러오기 */}
        <Card>
          <SectionHeader title="악보 관리" />
          <div className="p-3 flex flex-col gap-2">
            <button onClick={handleSave}
              className="flex items-center justify-center gap-2 w-full py-2 text-white rounded-lg text-sm font-medium transition-colors"
              style={{ background: 'var(--success)' }}>
              <Save size={14} /> 현재 악보 저장
            </button>
            <button onClick={() => setShowSavedList(v => !v)}
              className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: showSavedList ? 'var(--foreground)' : 'var(--surface)',
                color: showSavedList ? 'white' : 'var(--foreground)',
                border: `1px solid ${showSavedList ? 'var(--foreground)' : 'var(--border)'}`,
              }}>
              <FolderOpen size={14} /> 저장된 악보 {savedScores.length > 0 && `(${savedScores.length})`}
            </button>
          </div>
        </Card>

        {/* 저장 목록 */}
        {showSavedList && (
          <Card>
            <SectionHeader title="저장 목록">
              <button onClick={() => setShowSavedList(false)} style={{ color: 'var(--muted)' }}><X size={15} /></button>
            </SectionHeader>
            {savedScores.length === 0 ? (
              <p className="text-xs p-5 text-center" style={{ color: 'var(--muted)' }}>저장된 악보가 없습니다.</p>
            ) : (
              <ul className="divide-y max-h-72 overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
                {savedScores.map(s => (
                  <li key={s.id} className="p-3 transition-colors" style={{ borderColor: 'var(--border)' }}>
                    <p className="text-sm font-medium truncate mb-0.5" style={{ color: 'var(--foreground)' }}>{s.title}</p>
                    <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
                      {s.state.keySignature} · {s.state.timeSignature} · {s.state.tempo}BPM
                      <span className="ml-1.5">{new Date(s.savedAt).toLocaleDateString('ko-KR')}</span>
                    </p>
                    <div className="flex gap-1.5">
                      <button onClick={() => setPreviewScore(previewScore?.id === s.id ? null : s)}
                        className="flex-1 py-1 text-xs rounded-md transition-colors"
                        style={{ background: 'var(--background)', color: 'var(--muted)' }}>미리보기</button>
                      <button onClick={() => handleLoadScore(s)}
                        className="flex-1 py-1 text-xs rounded-md transition-colors"
                        style={{ background: '#EEF2FF', color: 'var(--primary)' }}>열기</button>
                      <button onClick={() => handlePreviewDownloadImage(s)}
                        className="py-1 px-2.5 text-xs rounded-md transition-colors"
                        style={{ background: '#dcfce7', color: '#16a34a' }}><Download size={11} /></button>
                      <button onClick={() => handleDeleteSaved(s.id)}
                        className="py-1 px-2.5 text-xs rounded-md transition-colors"
                        style={{ background: '#fef2f2', color: '#ef4444' }}><Trash2 size={11} /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      {/* ═══════════════════════════════════════════════
          메인 영역: 악보 + 팔레트
          ═══════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col gap-0 md:gap-4 min-w-0 md:overflow-y-auto md:pb-4">

        {/* ── 악보 표시 ── */}
        <Card className="md:rounded-2xl rounded-none border-x-0 md:border-x">
          <div
            className="flex items-center justify-between px-3 md:px-4 py-2"
            style={{ background: 'var(--background)', borderBottom: '1px solid var(--border)' }}
          >
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>악보</span>
            <div className="flex items-center gap-1.5 md:gap-2">
              <button onClick={() => { if (scoreRef.current) svgToPng(scoreRef.current, state.title); }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg transition-colors active:scale-95"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)', WebkitTapHighlightColor: 'transparent' }}>
                <Download size={11} /> <span className="hidden sm:inline">이미지</span>
              </button>
              <button onClick={() => window.dispatchEvent(new CustomEvent('abcjs-download-audio', { detail: { title: state.title } }))}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg text-white transition-colors active:scale-95"
                style={{ background: 'var(--primary)', WebkitTapHighlightColor: 'transparent' }}>
                <FileAudio size={11} /> WAV
              </button>
            </div>
          </div>
          <div ref={scoreRef} className="p-2 md:p-4 min-h-[180px] md:min-h-48">
            {noteCount === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3" style={{ color: 'var(--border)' }}>
                <Music2 size={36} />
                <div className="text-center">
                  <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>악보가 비어 있습니다</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                    <span className="hidden md:inline">왼쪽 패널에서 자동생성하거나,</span>
                    <span className="md:hidden">상단 「자동 생성」을 누르거나,</span>
                    {' '}아래 팔레트로 음표를 입력하세요
                  </p>
                </div>
              </div>
            ) : (
              <AbcjsRenderer
                abcString={abcString}
                prependBasePitch={prependBasePitch}
                prependMetronome={prependMetronome}
                timeSignature={state.timeSignature}
                tempo={state.tempo}
                scaleTempo={scaleTempo}
                keySignature={state.keySignature}
                metronomeFreq={metronomeFreq}
                examMode={examMode}
                examWaitSeconds={examWaitSeconds}
                stretchLast={getMeasureCount(state) > 0 && getMeasureCount(state) % 4 === 0}
                barsPerStaff={state.barsPerStaff}
                onNoteClick={handleAbcNoteClick}
                selectedNote={selectedNoteAbcInfo}
              />
            )}
          </div>
          {/* 수정 모드 표시 — PC 전용 (모바일은 하단 고정바 상단에 표시) */}
          {noteCount > 0 && (
            <div
              className="hidden md:flex px-3 md:px-4 py-2 text-xs items-center gap-2 transition-colors"
              style={{
                background: selectedNote ? '#fef2f2' : 'var(--background)',
                color: selectedNote ? '#dc2626' : 'var(--muted)',
                borderTop: `1px solid ${selectedNote ? '#fecaca' : 'var(--border)'}`,
              }}
            >
              {selectedNote ? (
                <>
                  <span className="font-bold">수정 모드</span>
                  {pendingTieFrom?.id === selectedNote.id && (
                    <span className="font-bold" style={{ color: '#b45309' }}>— 다음 음표를 눌러주세요</span>
                  )}
                  <span className="hidden sm:inline">— 팔레트에서 수정</span>
                  <button onClick={handleDeselect}
                    className="ml-auto shrink-0 underline font-medium"
                    style={{ WebkitTapHighlightColor: 'transparent' }}>
                    선택 해제
                  </button>
                </>
              ) : (
                <span>음표를 터치하면 수정할 수 있습니다</span>
              )}
            </div>
          )}
        </Card>

        {/* 미리보기 */}
        {previewScore && (
          <Card>
            <SectionHeader title={`미리보기: ${previewScore.title}`}>
              <button onClick={() => setPreviewScore(null)} style={{ color: 'var(--muted)' }}><X size={15} /></button>
            </SectionHeader>
            <div ref={previewScoreRef} className="p-4">
              <AbcjsRenderer abcString={generateAbc(previewScore.state)}
                timeSignature={previewScore.state.timeSignature}
                tempo={previewScore.state.tempo}
                keySignature={previewScore.state.keySignature}
                stretchLast={getMeasureCount(previewScore.state) > 0 && getMeasureCount(previewScore.state) % 4 === 0} />
            </div>
          </Card>
        )}

        {/* ═══════════════════════════════════════════════
            음표 입력 팔레트 (PC 전용 — 모바일은 하단 고정바 사용)
            ═══════════════════════════════════════════════ */}
        <Card className={`hidden md:block md:rounded-2xl ${selectedNote ? 'ring-2 ring-amber-300' : ''}`}>
          <button
            className="w-full flex items-center justify-between px-3 md:px-4 py-2.5"
            onClick={() => setPaletteOpen(v => !v)}
          >
            <div className="flex items-center gap-2">
              {selectedNote ? (
                <>
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#f59e0b' }}>수정</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#FEF3C7', color: '#92400e' }}>
                    {(() => {
                      const arr = selectedNote.staff === 'bass' ? (state.bassNotes || []) : state.notes;
                      const n = arr.find(x => x.id === selectedNote.id);
                      return n ? formatNoteLabel(n) : '';
                    })()} · {DUR_LABEL[duration]}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                    {state.useGrandStaff ? (activeStaff === 'treble' ? '높은음자리 추가' : '낮은음자리 추가') : '음표 추가'}
                  </span>
                  {noteCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--background)', color: 'var(--muted)' }}>
                      {state.notes.length}개{state.useGrandStaff ? ` + 베이스 ${state.bassNotes?.length ?? 0}개` : ''}
                    </span>
                  )}
                </>
              )}
            </div>
            {paletteOpen ? <ChevronUp size={15} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={15} style={{ color: 'var(--muted)' }} />}
          </button>

          {paletteOpen && (
            <div className="p-3 md:p-4 flex flex-col gap-3 md:gap-4" style={{ borderTop: '1px solid var(--border)' }}>

              {/* 큰보표 보표 선택 */}
              {state.useGrandStaff && !selectedNote && (
                <div className="flex gap-2">
                  {(['treble','bass'] as const).map(s => (
                    <button key={s} onClick={() => setActiveStaff(s)}
                      className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
                      style={{
                        background: activeStaff === s ? 'var(--primary)' : 'var(--background)',
                        color: activeStaff === s ? 'white' : 'var(--foreground)',
                        border: activeStaff === s ? 'none' : '1px solid var(--border)',
                        WebkitTapHighlightColor: 'transparent',
                      }}>
                      {s === 'treble' ? '높은음자리' : '낮은음자리'}
                      <span className="ml-1 opacity-70 text-xs">
                        ({s === 'treble' ? state.notes.length : (state.bassNotes?.length ?? 0)})
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* 길이 · 변화표 · 옥타브 · 이음표 · 잇단음표 — 모바일: 가로 스크롤, PC: flex-wrap */}
              <div className="flex flex-wrap gap-x-3 gap-y-2 md:gap-x-4 md:gap-y-3 items-start">
                {/* 음표 길이 */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>길이</p>
                  <div className="flex flex-wrap gap-1">
                    {DURATIONS.map(d => (
                      <button key={d.value} onClick={() => handleBaseDurationClick(d.value)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-90"
                        style={{
                          background: baseDur === d.value ? 'var(--primary)' : 'var(--background)',
                          color: baseDur === d.value ? 'white' : 'var(--foreground)',
                          border: baseDur === d.value ? 'none' : '1px solid var(--border)',
                          WebkitTapHighlightColor: 'transparent',
                        }}>
                        {d.label}
                      </button>
                    ))}
                    <button
                      onClick={handleDotToggle}
                      disabled={dotDisabled}
                      title={dotDisabled ? '16분음표는 점음표 불가' : '점음표 토글'}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-90"
                      style={{
                        background: hasDot ? '#ef4444' : dotDisabled ? 'var(--background)' : 'var(--background)',
                        color: hasDot ? 'white' : dotDisabled ? 'var(--border)' : 'var(--foreground)',
                        border: hasDot ? 'none' : '1px solid var(--border)',
                        opacity: dotDisabled ? 0.4 : 1,
                        cursor: dotDisabled ? 'not-allowed' : 'pointer',
                        WebkitTapHighlightColor: 'transparent',
                      }}>
                      점(·)
                    </button>
                  </div>
                </div>

                {/* 변화표 */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>변화표</p>
                  <div className="flex gap-1">
                    {ACCIDENTALS.map(a => (
                      <button key={a.label} onClick={() => handleAccidentalChange(a.value)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-90"
                        style={{
                          background: accidental === a.value ? '#ef4444' : 'var(--background)',
                          color: accidental === a.value ? 'white' : 'var(--foreground)',
                          border: accidental === a.value ? 'none' : '1px solid var(--border)',
                          WebkitTapHighlightColor: 'transparent',
                        }}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 옥타브 */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>옥타브</p>
                  <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: 'var(--background)' }}>
                    <button onClick={() => handleOctaveChange(Math.max(2, octave - 1))}
                      className="w-8 h-8 flex items-center justify-center rounded-lg font-bold text-sm active:scale-90 transition-transform"
                      style={{ background: 'var(--surface)', color: 'var(--foreground)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', WebkitTapHighlightColor: 'transparent' }}>
                      -
                    </button>
                    <span className="w-7 text-center text-sm font-bold" style={{ color: 'var(--foreground)' }}>{octave}</span>
                    <button onClick={() => handleOctaveChange(Math.min(6, octave + 1))}
                      className="w-8 h-8 flex items-center justify-center rounded-lg font-bold text-sm active:scale-90 transition-transform"
                      style={{ background: 'var(--surface)', color: 'var(--foreground)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', WebkitTapHighlightColor: 'transparent' }}>
                      +
                    </button>
                  </div>
                </div>

                {/* 이음표 */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>이음표</p>
                  <button onClick={handleTieButtonClick}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-90"
                    style={{
                      background: pendingTieFrom?.id === selectedNote?.id ? '#f59e0b' : tie ? 'var(--primary)' : 'var(--background)',
                      color: pendingTieFrom?.id === selectedNote?.id || tie ? 'white' : 'var(--foreground)',
                      border: (pendingTieFrom?.id === selectedNote?.id || tie) ? 'none' : '1px solid var(--border)',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                    {pendingTieFrom?.id === selectedNote?.id ? 'Tie 취소' : selectedNote ? 'Tie (다음 음)' : `Tie ${tie ? 'ON' : 'OFF'}`}
                  </button>
                </div>

                {/* 잇단음표 */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--muted)' }}>잇단음표</p>
                  <div className="flex gap-1 items-center flex-wrap">
                    {(() => {
                      const TUPLET_LABELS: Record<TupletType, string> = {
                        '': '없음', '2': '2연', '3': '3연', '4': '4연',
                        '5': '5연', '6': '6연', '7': '7연', '8': '8연',
                      };
                      const valid = getValidTupletTypesForDuration(duration);
                      const withCurrent = tuplet && !valid.includes(tuplet) ? [...valid, tuplet] : valid;
                      const options: [TupletType, string][] = [['', '없음'], ...withCurrent.map(t => [t, TUPLET_LABELS[t] || `${t}연`] as [TupletType, string])];
                      return options.map(([v, l]) => (
                        <button key={v} onClick={() => handleTupletChange(v)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-90"
                          style={{
                            background: tuplet === v ? '#f59e0b' : 'var(--background)',
                            color: tuplet === v ? 'white' : 'var(--foreground)',
                            border: tuplet === v ? 'none' : '1px solid var(--border)',
                            WebkitTapHighlightColor: 'transparent',
                          }}>
                          {l}
                        </button>
                      ));
                    })()}
                    {!selectedNote && tuplet && <span className="text-xs font-bold ml-1" style={{ color: '#f59e0b' }}>({tupletCounter}/{tuplet})</span>}
                  </div>
                </div>
              </div>

              {/* 음표 버튼 */}
              <div>
                {selectedNote && (
                  <p className="text-[10px] font-bold mb-1.5" style={{ color: '#f59e0b' }}>음이름을 누르면 선택된 음표의 음정이 변경됩니다</p>
                )}
                <div className="flex gap-1.5 md:gap-2 items-center">
                  {PITCHES.map(p => (
                    <button key={p} onClick={() => handleAddNote(p)}
                      className={`flex-1 h-11 md:h-14 rounded-xl shadow-sm flex flex-col items-center justify-center active:scale-95 transition-all ${
                        selectedNote ? 'ring-4 ring-amber-400 ring-offset-2' : ''
                      }`}
                      style={{
                        background: PITCH_STYLES[p].bg,
                        color: PITCH_STYLES[p].text,
                        border: `2px solid ${PITCH_STYLES[p].border}`,
                        WebkitTapHighlightColor: 'transparent',
                      }}>
                      <span className="text-base md:text-lg font-bold leading-none">{p}</span>
                      <span className="text-[10px] md:text-xs opacity-80 mt-0.5 font-bold">{PITCH_LABELS[p]}</span>
                    </button>
                  ))}
                  <div className="w-px h-8" style={{ background: 'var(--border)' }} />
                  <button onClick={() => handleAddNote('rest')}
                    className="px-3 md:px-4 h-11 md:h-12 rounded-xl font-medium active:scale-90 transition-all text-sm whitespace-nowrap"
                    style={{ background: 'var(--background)', color: 'var(--muted)', border: '1px solid var(--border)', WebkitTapHighlightColor: 'transparent' }}>
                    쉼표
                  </button>
                </div>
              </div>

              {/* 편집 버튼 */}
              <div className="flex items-center gap-2 flex-wrap">
                {selectedNote ? (
                  <>
                    <button
                      onClick={() => {
                        const arr = selectedNote.staff === 'bass' ? (state.bassNotes || []) : state.notes;
                        const idx = arr.findIndex(n => n.id === selectedNote.id);
                        if (idx >= 0) handleDeleteNote(selectedNote.id, selectedNote.staff);
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold active:scale-95 transition-all"
                      style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', WebkitTapHighlightColor: 'transparent' }}>
                      <Trash2 size={13} /> 삭제
                    </button>
                    <button onClick={handleDeselect}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold active:scale-95 transition-all"
                      style={{ background: 'var(--background)', color: 'var(--muted)', WebkitTapHighlightColor: 'transparent' }}>
                      선택 해제
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={handleUndo} disabled={curNotes.length === 0}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-30 active:scale-95"
                      style={{ background: 'var(--surface)', color: 'var(--foreground)', border: '1px solid var(--border)', WebkitTapHighlightColor: 'transparent' }}>
                      <Undo size={13} /> 되돌리기
                    </button>
                    <button onClick={handleClear} disabled={curNotes.length === 0}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-30 active:scale-95"
                      style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', WebkitTapHighlightColor: 'transparent' }}>
                      <Trash2 size={13} /> 전체 삭제
                    </button>
                  </>
                )}
                {/* PC 단축키 안내 */}
                <div className="ml-auto hidden md:flex items-center gap-2.5 text-xs" style={{ color: 'var(--muted)' }}>
                  <Keyboard size={12} />
                  <span><kbd className="px-1.5 py-0.5 rounded font-mono text-[11px]" style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>1</kbd>~<kbd className="px-1.5 py-0.5 rounded font-mono text-[11px]" style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>7</kbd> = C~B</span>
                  <span><kbd className="px-1.5 py-0.5 rounded font-mono text-[11px]" style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>↑↓</kbd> 옥타브</span>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* ═══════════════════════════════════════════════
            모바일: 하단 고정 팔레트 높이만큼 여백
            ═══════════════════════════════════════════════ */}
        <div className="md:hidden" style={{ height: '240px' }} aria-hidden="true" />
      </div>

      {/* ── 모바일 하단 고정 음표 입력 바 ── */}
      <div
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex flex-col"
        style={{
          background: 'var(--surface)',
          borderTop: `2px solid ${selectedNote ? '#fcd34d' : 'var(--border)'}`,
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.10)',
        }}
      >
        {/* 모바일 상태바 — 항상 팔레트 최상단에 고정 노출 */}
        {noteCount > 0 && (
          <div
            className="flex items-center gap-2 px-3 py-1.5 text-xs transition-colors"
            style={{
              background: selectedNote ? '#fef2f2' : 'var(--background)',
              color: selectedNote ? '#dc2626' : 'var(--muted)',
              borderBottom: `1px solid ${selectedNote ? '#fecaca' : 'var(--border)'}`,
            }}
          >
            {selectedNote ? (
              <>
                <span className="font-bold">수정 모드</span>
                {pendingTieFrom?.id === selectedNote.id && (
                  <span className="font-bold shrink-0" style={{ color: '#b45309' }}>다음 음표를 눌러주세요</span>
                )}
                <button onClick={handleDeselect}
                  className="ml-auto shrink-0 underline font-medium"
                  style={{ WebkitTapHighlightColor: 'transparent' }}>
                  선택 해제
                </button>
              </>
            ) : (
              <span>음표를 터치하면 수정할 수 있습니다</span>
            )}
          </div>
        )}

        {/* ① 잇단음표 서브메뉴 팝업 (선택 시에만) */}
        {mobileSubMenu === 'tuplet' && (
          <div className="px-2 pt-2 pb-1.5 flex gap-1.5 flex-wrap"
            style={{ borderBottom: '1px solid var(--border)', background: 'var(--background)' }}>
            {(() => {
              const TUPLET_LABELS: Record<TupletType, string> = {
                '': '없음', '2': '2연', '3': '3연', '4': '4연',
                '5': '5연', '6': '6연', '7': '7연', '8': '8연',
              };
              const valid = getValidTupletTypesForDuration(duration);
              const withCurrent = tuplet && !valid.includes(tuplet) ? [...valid, tuplet] : valid;
              const options: [TupletType, string][] = [['', '없음'], ...withCurrent.map(t => [t, TUPLET_LABELS[t] || `${t}연`] as [TupletType, string])];
              return options.map(([v, l]) => (
                <button key={v} onClick={() => { handleTupletChange(v); setMobileSubMenu(null); }}
                  className="px-3 py-2 rounded-lg text-sm font-semibold active:scale-90 transition-all"
                  style={{
                    background: tuplet === v ? '#f59e0b' : 'var(--surface)',
                    color: tuplet === v ? 'white' : 'var(--foreground)',
                    border: tuplet === v ? 'none' : '1px solid var(--border)',
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  {l}
                </button>
              ));
            })()}
          </div>
        )}

        {/* ② 변화표 서브메뉴 팝업 (선택 시에만) */}
        {mobileSubMenu === 'accidental' && (
          <div className="px-2 pt-2 pb-1.5 flex gap-1.5"
            style={{ borderBottom: '1px solid var(--border)', background: 'var(--background)' }}>
            {ACCIDENTALS.map(a => (
              <button key={a.label} onClick={() => { handleAccidentalChange(a.value); setMobileSubMenu(null); }}
                className="flex-1 py-2 rounded-lg text-sm font-semibold active:scale-90 transition-all"
                style={{
                  background: accidental === a.value ? '#ef4444' : 'var(--surface)',
                  color: accidental === a.value ? 'white' : 'var(--foreground)',
                  border: accidental === a.value ? 'none' : '1px solid var(--border)',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                {a.label}
              </button>
            ))}
          </div>
        )}

        {/* ③ 1행: 큰보표 선택(선택적) + 편집 버튼 우측 */}
        <div className="flex items-center gap-1 px-2 pt-2 pb-1">
          {/* 큰보표 보표 선택 */}
          {state.useGrandStaff && !selectedNote && (
            <>
              {(['treble', 'bass'] as const).map(s => (
                <button key={s} onClick={() => setActiveStaff(s)}
                  className="flex-shrink-0 px-2.5 h-7 rounded-lg text-[11px] font-bold active:scale-90 transition-all"
                  style={{
                    background: activeStaff === s ? 'var(--primary)' : 'var(--background)',
                    color: activeStaff === s ? 'white' : 'var(--foreground)',
                    border: activeStaff === s ? 'none' : '1px solid var(--border)',
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  {s === 'treble' ? '높은' : '낮은'}
                </button>
              ))}
            </>
          )}

          {/* 편집 버튼들 — 오른쪽 끝 고정 */}
          <div className="ml-auto flex-shrink-0 flex items-center gap-1">
            {selectedNote ? (
              <>
                <button
                  onClick={() => { if (selectedNote) handleDeleteNote(selectedNote.id, selectedNote.staff); }}
                  className="w-8 h-7 flex items-center justify-center rounded-lg active:scale-90 transition-all"
                  style={{ background: '#fef2f2', color: '#ef4444', WebkitTapHighlightColor: 'transparent' }}>
                  <Trash2 size={13} />
                </button>
                <button onClick={handleDeselect}
                  className="px-2 h-7 rounded-lg text-[11px] font-bold active:scale-90 transition-all"
                  style={{ background: 'var(--background)', color: 'var(--muted)', border: '1px solid var(--border)', WebkitTapHighlightColor: 'transparent' }}>
                  해제
                </button>
              </>
            ) : (
              <>
                <button onClick={handleUndo} disabled={curNotes.length === 0}
                  className="w-8 h-7 flex items-center justify-center rounded-lg active:scale-90 transition-all disabled:opacity-30"
                  style={{ background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)', WebkitTapHighlightColor: 'transparent' }}>
                  <Undo size={13} />
                </button>
                <button onClick={handleClear} disabled={curNotes.length === 0}
                  className="w-8 h-7 flex items-center justify-center rounded-lg active:scale-90 transition-all disabled:opacity-30"
                  style={{ background: '#fef2f2', color: '#ef4444', WebkitTapHighlightColor: 'transparent' }}>
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* ④ 2행: 옥타브 인라인 + 변화표·Tie·잇단음 */}
        <div className="flex items-center gap-1 px-2 pb-1">
          {/* 옥타브 인라인 */}
          <button onClick={() => handleOctaveChange(Math.max(2, octave - 1))}
            className="w-8 h-7 flex items-center justify-center rounded-lg font-bold text-sm active:scale-90 transition-transform flex-shrink-0"
            style={{ background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)', WebkitTapHighlightColor: 'transparent' }}>
            −
          </button>
          <span className="w-9 text-center text-[11px] font-bold flex-shrink-0" style={{ color: 'var(--foreground)' }}>
            Oct{octave}
          </span>
          <button onClick={() => handleOctaveChange(Math.min(6, octave + 1))}
            className="w-8 h-7 flex items-center justify-center rounded-lg font-bold text-sm active:scale-90 transition-transform flex-shrink-0"
            style={{ background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)', WebkitTapHighlightColor: 'transparent' }}>
            +
          </button>

          <div className="w-px h-5 mx-0.5 flex-shrink-0" style={{ background: 'var(--border)' }} />

          {/* 변화표 버튼 */}
          <button
            onClick={() => setMobileSubMenu(mobileSubMenu === 'accidental' ? null : 'accidental')}
            className="flex-shrink-0 flex items-center gap-0.5 px-2 h-7 rounded-lg text-[11px] font-bold active:scale-90 transition-all"
            style={{
              background: mobileSubMenu === 'accidental' ? '#ef4444' : accidental ? '#fef2f2' : 'var(--background)',
              color: mobileSubMenu === 'accidental' ? 'white' : accidental ? '#ef4444' : 'var(--foreground)',
              border: (mobileSubMenu === 'accidental' || accidental) ? 'none' : '1px solid var(--border)',
              WebkitTapHighlightColor: 'transparent',
            }}>
            {accidental === '#' ? '♯' : accidental === 'b' ? '♭' : accidental === 'n' ? '♮' : '변화표'}
            <ChevronDown size={9} />
          </button>

          {/* 이음표 토글 */}
          <button onClick={handleTieButtonClick}
            className="flex-shrink-0 px-2 h-7 rounded-lg text-[11px] font-bold active:scale-90 transition-all"
            style={{
              background: pendingTieFrom?.id === selectedNote?.id ? '#f59e0b' : tie ? 'var(--primary)' : 'var(--background)',
              color: pendingTieFrom?.id === selectedNote?.id || tie ? 'white' : 'var(--foreground)',
              border: (pendingTieFrom?.id === selectedNote?.id || tie) ? 'none' : '1px solid var(--border)',
              WebkitTapHighlightColor: 'transparent',
            }}>
            {pendingTieFrom?.id === selectedNote?.id ? '취소' : selectedNote ? 'Tie' : `Tie${tie ? '✓' : ''}`}
          </button>

          {/* 잇단음 버튼 */}
          <button
            onClick={() => setMobileSubMenu(mobileSubMenu === 'tuplet' ? null : 'tuplet')}
            className="flex-shrink-0 flex items-center gap-0.5 px-2 h-7 rounded-lg text-[11px] font-bold active:scale-90 transition-all"
            style={{
              background: mobileSubMenu === 'tuplet' ? '#f59e0b' : tuplet ? '#FEF3C7' : 'var(--background)',
              color: mobileSubMenu === 'tuplet' ? 'white' : tuplet ? '#92400e' : 'var(--foreground)',
              border: (mobileSubMenu === 'tuplet' || tuplet) ? 'none' : '1px solid var(--border)',
              WebkitTapHighlightColor: 'transparent',
            }}>
            {tuplet ? `${tuplet}연` : '잇단음'}
            {tuplet && !selectedNote && <span className="ml-0.5">({tupletCounter}/{tuplet})</span>}
            <ChevronDown size={9} />
          </button>
        </div>

        {/* ⑤ 3행: 길이 버튼 */}
        <div className="flex items-center gap-1 px-2 pb-1">
          {DURATIONS.map(d => (
            <button key={d.value} onClick={() => handleBaseDurationClick(d.value)}
              className="flex-1 py-1.5 rounded-lg text-[11px] font-bold active:scale-90 transition-all"
              style={{
                background: baseDur === d.value ? 'var(--primary)' : 'var(--background)',
                color: baseDur === d.value ? 'white' : 'var(--foreground)',
                border: baseDur === d.value ? 'none' : '1px solid var(--border)',
                WebkitTapHighlightColor: 'transparent',
              }}>
              {d.label}
            </button>
          ))}
          <button onClick={handleDotToggle} disabled={dotDisabled}
            className="flex-shrink-0 px-2 py-1.5 rounded-lg text-[11px] font-bold active:scale-90 transition-all"
            style={{
              background: hasDot ? '#ef4444' : 'var(--background)',
              color: hasDot ? 'white' : dotDisabled ? 'var(--border)' : 'var(--foreground)',
              border: hasDot ? 'none' : '1px solid var(--border)',
              opacity: dotDisabled ? 0.4 : 1,
              WebkitTapHighlightColor: 'transparent',
            }}>
            점·
          </button>
        </div>

        {/* ⑤ CDEFGAB + 쉼표 버튼 행 — flex + 짤림 없음 */}
        <div className="flex gap-1 px-2 pb-2">
          {PITCHES.map(p => (
            <button key={p} onClick={() => handleAddNote(p)}
              className={`flex-1 h-12 rounded-xl flex flex-col items-center justify-center active:scale-95 transition-all px-0 ${
                selectedNote ? 'ring-2 ring-amber-400 ring-offset-1' : ''
              }`}
              style={{
                background: PITCH_STYLES[p].bg,
                color: PITCH_STYLES[p].text,
                border: `2px solid ${PITCH_STYLES[p].border}`,
                WebkitTapHighlightColor: 'transparent',
                minWidth: 0,
              }}>
              <span className="text-xs font-bold leading-tight">{p}</span>
              <span className="text-[9px] font-bold leading-tight">{PITCH_LABELS[p]}</span>
            </button>
          ))}
          <button onClick={() => handleAddNote('rest')}
            className="flex-shrink-0 w-12 h-11 rounded-xl text-[11px] font-bold active:scale-90 transition-all"
            style={{
              background: 'var(--background)',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
              WebkitTapHighlightColor: 'transparent',
            }}>
            쉼표
          </button>
        </div>
      </div>
    </div>
  );
}
