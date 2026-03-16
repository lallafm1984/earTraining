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
import { generateScore, Difficulty } from '@/lib/scoreGenerator';

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

const DIFF_LABELS: Record<Difficulty, string> = { beginner:'초급', intermediate:'중급', advanced:'고급' };
const DIFF_DESC: Record<Difficulty, string> = {
  beginner: '온·2분·4분음표, 순차 2~3도',
  intermediate: '8분·점4분, 4~8도 도약, 임시표·3연음',
  advanced: '16분·당김음·임시표, 대위법 성부',
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
    title: '새 악보', keySignature: 'C', timeSignature: '4/4', tempo: 120, notes: [],
  });
  const [duration, setDuration]     = useState<NoteDuration>('4');
  const [accidental, setAccidental] = useState<Accidental>('');
  const [octave, setOctave]         = useState(4);
  const [tie, setTie]               = useState(false);
  const [tuplet, setTuplet]         = useState<TupletType>('');
  const [tupletCounter, setTupletCounter] = useState(0);
  const [activeStaff, setActiveStaff] = useState<'treble' | 'bass'>('treble');
  const [selectedNote, setSelectedNote] = useState<{ id: string; staff: 'treble' | 'bass' } | null>(null);

  // 재생 옵션
  const [prependBasePitch, setPrependBasePitch] = useState(false);
  const [prependMetronome, setPrependMetronome] = useState(false);
  const [scaleTempo, setScaleTempo]             = useState(120);
  const [metronomeFreq, setMetronomeFreq]       = useState(1000);
  const [examMode, setExamMode]                 = useState(false);
  const [examWaitSeconds, setExamWaitSeconds]   = useState(3);

  // 패널
  const [showGenPanel, setShowGenPanel]     = useState(false);
  const [showSavedList, setShowSavedList]   = useState(false);
  const [previewScore, setPreviewScore]     = useState<SavedScore | null>(null);
  const [paletteOpen, setPaletteOpen]       = useState(true);

  // 자동생성
  const [genDifficulty, setGenDifficulty] = useState<Difficulty>('beginner');
  const [genMeasures, setGenMeasures]     = useState(4);
  const [savedScores, setSavedScores]     = useState<SavedScore[]>([]);

  // 모바일 바텀시트
  const [mobileSheet, setMobileSheet] = useState<'settings' | 'playback' | 'generate' | 'saved' | null>(null);

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

  const handleDeselect = () => setSelectedNote(null);

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
    setState(p => {
      const arr = isBass ? (p.bassNotes || []) : p.notes;
      const next = arr.map(n => n.id === selectedNote.id
        ? { ...n, pitch, octave: pitch === 'rest' ? 4 : octave, accidental: pitch === 'rest' ? '' as Accidental : accidental }
        : n);
      return { ...p, ...(isBass ? { bassNotes: next } : { notes: next }) };
    });
  };

  const handleDurationChange = (d: NoteDuration) => {
    if (!selectedNote) { setDuration(d); return; }
    const isBass = selectedNote.staff === 'bass';

    const arr = isBass ? (state.bassNotes || []) : state.notes;
    const idx = arr.findIndex(n => n.id === selectedNote.id);
    if (idx < 0) { setDuration(d); return; }

    const oldNote = arr[idx];
    const oldS = durationToSixteenths(oldNote.duration);
    const barLen = getSixteenthsPerBar(state.timeSignature);

    let noteStart = 0;
    for (let i = 0; i < idx; i++) noteStart += durationToSixteenths(arr[i].duration);
    const noteStartInMeasure = noteStart % barLen;
    const maxSixteenths = barLen - noteStartInMeasure;

    const DUR_OPTIONS: [NoteDuration, number][] = [
      ['1', 16], ['2.', 12], ['2', 8], ['4.', 6], ['4', 4], ['8.', 3], ['8', 2], ['16', 1],
    ];
    let requestedS = durationToSixteenths(d);
    let effectiveDur: NoteDuration = d;
    let newS = requestedS;
    if (requestedS > maxSixteenths) {
      const capped = DUR_OPTIONS.find(([, s]) => s <= maxSixteenths);
      if (!capped) { setDuration(d); return; }
      effectiveDur = capped[0];
      newS = capped[1];
    }

    setDuration(effectiveDur);

    setState(p => {
      const pArr = isBass ? (p.bassNotes || []) : p.notes;
      const pIdx = pArr.findIndex(n => n.id === selectedNote.id);
      if (pIdx < 0) return p;

      const newArr = [...pArr];
      newArr[pIdx] = { ...pArr[pIdx], duration: effectiveDur };

      if (newS < oldS) {
        const noteEndInBar = (noteStart + newS) % barLen;
        const spaceLeft = noteEndInBar === 0 ? 0 : barLen - noteEndInBar;
        const fillAmount = Math.min(oldS - newS, spaceLeft);
        if (fillAmount > 0) {
          const rests: ScoreNote[] = fillWithRests(fillAmount).map(rd => ({
            id: Math.random().toString(36).substr(2, 9),
            pitch: 'rest' as PitchName, octave: 4, duration: rd,
            accidental: '' as Accidental, tie: false,
          }));
          newArr.splice(pIdx + 1, 0, ...rests);
        }
      } else if (newS > oldS) {
        const delta = newS - oldS;
        let remaining = delta;
        let removeCount = 0;
        let leftoverRests: ScoreNote[] = [];

        for (let i = pIdx + 1; i < newArr.length; i++) {
          const next = newArr[i];
          const nextS = durationToSixteenths(next.duration);
          if (nextS <= remaining) {
            removeCount++;
            remaining -= nextS;
            if (remaining === 0) break;
          } else {
            removeCount++;
            const leftover = nextS - remaining;
            leftoverRests = fillWithRests(leftover).map(rd => ({
              id: Math.random().toString(36).substr(2, 9),
              pitch: 'rest' as PitchName, octave: 4, duration: rd,
              accidental: '' as Accidental, tie: false,
            }));
            remaining = 0;
            break;
          }
        }

        if (removeCount > 0) {
          newArr.splice(pIdx + 1, removeCount);
          if (leftoverRests.length > 0) newArr.splice(pIdx + 1, 0, ...leftoverRests);
        }
      }

      return { ...p, ...(isBass ? { bassNotes: newArr } : { notes: newArr }) };
    });
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
      setTupletCounter(next >= tupletCount ? 0 : next);
    }
  };

  const handleInsertBefore = (index: number, staff: 'treble' | 'bass') => {
    setSelectedNote(null);
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
  };

  const handleAbcNoteClick = useCallback((noteIndex: number, voice: 'treble' | 'bass') => {
    const arr = voice === 'bass' ? (state.bassNotes || []) : state.notes;
    if (noteIndex < arr.length) {
      handleSelectNote(arr[noteIndex].id, voice);
      setPaletteOpen(true);
    }
  }, [state.notes, state.bassNotes]);  // eslint-disable-line

  const selectedNoteAbcInfo = (() => {
    if (!selectedNote) return null;
    const arr = selectedNote.staff === 'bass' ? (state.bassNotes || []) : state.notes;
    const index = arr.findIndex(n => n.id === selectedNote.id);
    if (index < 0) return null;
    return { index, voice: selectedNote.staff };
  })();

  const handleUndo = () => {
    const isBass = state.useGrandStaff && activeStaff === 'bass';
    setState(p => isBass
      ? { ...p, bassNotes: (p.bassNotes || []).slice(0, -1) }
      : { ...p, notes: p.notes.slice(0, -1) });
  };

  const handleClear = () => {
    const isBass = state.useGrandStaff && activeStaff === 'bass';
    if (confirm(`${isBass ? '낮은' : '높은'}음자리의 모든 음표를 지우시겠습니까?`)) {
      setState(p => isBass ? { ...p, bassNotes: [] } : { ...p, notes: [] });
    }
  };

  const handleGenerate = useCallback(() => {
    const result = generateScore({
      keySignature: state.keySignature, timeSignature: state.timeSignature,
      difficulty: genDifficulty, measures: genMeasures,
      useGrandStaff: state.useGrandStaff ?? false,
    });
    setState(p => ({ ...p, notes: result.trebleNotes, bassNotes: result.bassNotes }));
    setShowGenPanel(false);
    setMobileSheet(null);
  }, [state.keySignature, state.timeSignature, state.useGrandStaff, genDifficulty, genMeasures]);

  const handleSave = useCallback(() => {
    const scores = getSavedScores();
    scores.unshift({ id: Date.now().toString(), title: state.title || '제목 없음', state: { ...state }, savedAt: new Date().toISOString() });
    persistScores(scores); setSavedScores(scores); alert('악보가 저장되었습니다.');
  }, [state]);

  const handleLoadScore = useCallback((saved: SavedScore) => {
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
    if (!selectedNote) return;
    const isBass = selectedNote.staff === 'bass';
    const isRest = pitch === 'rest';
    const newNote: ScoreNote = {
      id: Math.random().toString(36).substr(2, 9),
      pitch,
      octave: isRest ? 4 : octave,
      accidental: isRest ? '' as Accidental : accidental,
      duration,
      tie: isRest ? false : tie,
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
  }, [selectedNote, octave, accidental, duration, tie]);

  // 키보드 단축키
  const handleAddNoteRef = useRef(handleAddNote);
  handleAddNoteRef.current = handleAddNote;
  const handleInsertAfterRef = useRef(handleInsertAfterSelected);
  handleInsertAfterRef.current = handleInsertAfterSelected;
  const selectedNoteRef = useRef(selectedNote);
  selectedNoteRef.current = selectedNote;
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
      if (e.key === 'Escape') setSelectedNote(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const abcString = generateAbc(state);
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
    <div className="flex flex-col md:flex-row gap-0 md:gap-5 h-full md:p-5">

      {/* ═══════════════════════════════════════════════
          모바일: 설정 툴바 (상단 고정, 간결한 칩 형태)
          ═══════════════════════════════════════════════ */}
      <div
        className="md:hidden flex items-center gap-2 px-3 py-2 overflow-x-auto"
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <button
          onClick={() => setMobileSheet('settings')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold flex-shrink-0 active:scale-95 transition-transform"
          style={{ background: 'var(--primary)18', color: 'var(--primary)', WebkitTapHighlightColor: 'transparent' }}
        >
          <Sliders size={13} />
          {state.keySignature} · {state.timeSignature}
        </button>
        <button
          onClick={() => setMobileSheet('playback')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold flex-shrink-0 active:scale-95 transition-transform"
          style={{ background: '#EEF2FF', color: 'var(--primary)', WebkitTapHighlightColor: 'transparent' }}
        >
          <Disc3 size={13} />
          재생 옵션
        </button>
        <button
          onClick={() => setMobileSheet('generate')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold flex-shrink-0 active:scale-95 transition-transform"
          style={{ background: '#FEF3C7', color: '#92400e', WebkitTapHighlightColor: 'transparent' }}
        >
          <Sparkles size={13} />
          자동 생성
        </button>
        <button
          onClick={() => setMobileSheet('saved')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold flex-shrink-0 active:scale-95 transition-transform"
          style={{ background: 'var(--background)', color: 'var(--muted)', border: '1px solid var(--border)', WebkitTapHighlightColor: 'transparent' }}
        >
          <Archive size={13} />
          저장
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
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-xs font-bold mb-2" style={{ color: 'var(--muted)' }}>난이도</p>
            <div className="flex gap-2">
              {(['beginner','intermediate','advanced'] as Difficulty[]).map(d => (
                <button key={d} onClick={() => setGenDifficulty(d)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
                  style={{
                    background: genDifficulty === d ? 'var(--primary)' : 'var(--background)',
                    color: genDifficulty === d ? 'white' : 'var(--foreground)',
                    border: genDifficulty === d ? 'none' : '1px solid var(--border)',
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  {DIFF_LABELS[d]}
                </button>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>{DIFF_DESC[genDifficulty]}</p>
          </div>
          <div>
            <p className="text-xs font-bold mb-2" style={{ color: 'var(--muted)' }}>마디 수</p>
            <div className="flex gap-2">
              {[4, 8, 12, 16].map(n => (
                <button key={n} onClick={() => setGenMeasures(n)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95"
                  style={{
                    background: genMeasures === n ? 'var(--primary)' : 'var(--background)',
                    color: genMeasures === n ? 'white' : 'var(--foreground)',
                    border: genMeasures === n ? 'none' : '1px solid var(--border)',
                    WebkitTapHighlightColor: 'transparent',
                  }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleGenerate}
            className="w-full py-3 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 active:scale-95 transition-transform"
            style={{ background: 'var(--primary)', WebkitTapHighlightColor: 'transparent' }}>
            <RefreshCw size={15} /> 생성하기
          </button>
          <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
            현재 조성·박자·큰보표 설정이 적용됩니다. 기존 음표는 교체됩니다.
          </p>
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
          <button className="w-full flex items-center justify-between px-4 py-3"
            onClick={() => setShowGenPanel(v => !v)}>
            <div className="flex items-center gap-2">
              <Wand2 size={15} style={{ color: '#f59e0b' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>자동 생성</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#FEF3C7', color: '#92400e' }}>
                {DIFF_LABELS[genDifficulty]} · {genMeasures}마디
              </span>
            </div>
            {showGenPanel ? <ChevronUp size={15} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={15} style={{ color: 'var(--muted)' }} />}
          </button>
          {showGenPanel && (
            <div className="px-4 py-4 flex flex-col gap-4" style={{ borderTop: '1px solid var(--border)' }}>
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted)' }}>난이도</p>
                <div className="flex gap-1.5">
                  {(['beginner','intermediate','advanced'] as Difficulty[]).map(d => (
                    <button key={d} onClick={() => setGenDifficulty(d)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                        genDifficulty === d ? 'text-white shadow-sm' : 'hover:opacity-80'
                      }`}
                      style={{
                        background: genDifficulty === d ? 'var(--primary)' : 'var(--background)',
                        color: genDifficulty === d ? 'white' : 'var(--foreground)',
                        border: genDifficulty === d ? 'none' : '1px solid var(--border)',
                      }}>
                      {DIFF_LABELS[d]}
                    </button>
                  ))}
                </div>
                <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>{DIFF_DESC[genDifficulty]}</p>
              </div>
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: 'var(--muted)' }}>마디 수</p>
                <div className="flex gap-1.5">
                  {[4, 8, 12, 16].map(n => (
                    <button key={n} onClick={() => setGenMeasures(n)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                        genMeasures === n ? 'text-white shadow-sm' : 'hover:opacity-80'
                      }`}
                      style={{
                        background: genMeasures === n ? 'var(--primary)' : 'var(--background)',
                        color: genMeasures === n ? 'white' : 'var(--foreground)',
                        border: genMeasures === n ? 'none' : '1px solid var(--border)',
                      }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleGenerate}
                className="w-full py-2.5 rounded-lg font-semibold text-sm text-white active:scale-[0.98] transition-all shadow flex items-center justify-center gap-2"
                style={{ background: 'var(--primary)' }}>
                <RefreshCw size={15} /> 생성하기
              </button>
            </div>
          )}
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
                onNoteClick={handleAbcNoteClick}
                selectedNote={selectedNoteAbcInfo}
              />
            )}
          </div>
          {/* 수정 모드 표시 */}
          {noteCount > 0 && (
            <div
              className="px-3 md:px-4 py-2 text-xs flex items-center gap-2 transition-colors"
              style={{
                background: selectedNote ? '#fef2f2' : 'var(--background)',
                color: selectedNote ? '#dc2626' : 'var(--muted)',
                borderTop: `1px solid ${selectedNote ? '#fecaca' : 'var(--border)'}`,
              }}
            >
              {selectedNote ? (
                <>
                  <span className="font-bold">수정 모드</span>
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
            음표 입력 팔레트
            ═══════════════════════════════════════════════ */}
        <Card className={`md:rounded-2xl rounded-none border-x-0 md:border-x ${selectedNote ? 'ring-2 ring-amber-300' : ''}`}>
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
                  <button onClick={() => setTie(v => !v)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-90"
                    style={{
                      background: tie ? 'var(--primary)' : 'var(--background)',
                      color: tie ? 'white' : 'var(--foreground)',
                      border: tie ? 'none' : '1px solid var(--border)',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                    Tie {tie ? 'ON' : 'OFF'}
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
                      className="flex-1 h-11 md:h-12 rounded-xl shadow-sm text-base md:text-lg font-bold active:scale-90 transition-all"
                      style={{
                        background: selectedNote ? '#FEF3C7' : 'var(--surface)',
                        color: selectedNote ? '#92400e' : 'var(--primary)',
                        border: `2px solid ${selectedNote ? '#FDE68A' : 'var(--primary)30'}`,
                        WebkitTapHighlightColor: 'transparent',
                      }}>
                      {p}
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

      </div>
    </div>
  );
}
