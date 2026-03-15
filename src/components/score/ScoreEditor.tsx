'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ScoreState, ScoreNote, NoteDuration, Accidental, PitchName, TupletType,
  generateAbc, getTupletNoteDuration,
} from '@/lib/scoreUtils';
import AbcjsRenderer from './AbcjsRenderer';
import {
  Download, Trash2, Undo, FileAudio, Save, FolderOpen, X,
  Keyboard, Wand2, ChevronDown, ChevronUp, Music2, Settings2,
  RefreshCw,
} from 'lucide-react';
import { generateScore, Difficulty } from '@/lib/scoreGenerator';

// ── SVG → PNG ──────────────────────────────────────────────────
const TARGET_WIDTH = 1920;

function svgToPng(container: HTMLElement, title: string) {
  const svg = container.querySelector('svg');
  if (!svg) { alert('악보 SVG를 찾을 수 없습니다.'); return; }

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  // 원본 SVG의 실제 크기 확보
  const bbox = svg.getBoundingClientRect();
  const srcW = parseFloat(clone.getAttribute('width') || '') || bbox.width || 800;
  const srcH = parseFloat(clone.getAttribute('height') || '') || bbox.height || 400;

  // 가로 1920px 기준으로 비율 유지 스케일 계산
  const scale = TARGET_WIDTH / srcW;
  const outW  = TARGET_WIDTH;
  const outH  = Math.round(srcH * scale);

  // clone SVG에 명시적 크기 설정 (viewBox 보존)
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
  { value: '2.', label: '점2' },
  { value: '4.', label: '점4' },
  { value: '8.', label: '점8' },
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

// ── 섹션 카드 ──
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// ── 섹션 헤더 ──
function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50 rounded-t-xl">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</span>
      {children}
    </div>
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

  const scoreRef        = useRef<HTMLDivElement>(null);
  const previewScoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSavedScores(getSavedScores()); }, []);

  const handleAddNote = (pitch: PitchName) => {
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
    setState(p => ({
      ...p,
      ...(isBass ? { bassNotes: [...(p.bassNotes || []), newNote] } : { notes: [...p.notes, newNote] }),
    }));
    if (tuplet && !isRest) {
      const next = tupletCounter + 1;
      setTupletCounter(next >= tupletCount ? 0 : next);
    }
  };

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
  }, [state.keySignature, state.timeSignature, state.useGrandStaff, genDifficulty, genMeasures]);

  const handleSave = useCallback(() => {
    const scores = getSavedScores();
    scores.unshift({ id: Date.now().toString(), title: state.title || '제목 없음', state: { ...state }, savedAt: new Date().toISOString() });
    persistScores(scores); setSavedScores(scores); alert('악보가 저장되었습니다.');
  }, [state]);

  const handleLoadScore = useCallback((saved: SavedScore) => {
    setState(saved.state); setShowSavedList(false); setPreviewScore(null);
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

  // 단축키
  const handleAddNoteRef = useRef(handleAddNote);
  handleAddNoteRef.current = handleAddNote;
  useEffect(() => {
    const MAP: Record<string, PitchName> = { '1':'C','2':'D','3':'E','4':'F','5':'G','6':'A','7':'B' };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const p = MAP[e.key];
      if (p) { e.preventDefault(); handleAddNoteRef.current(p); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setOctave(v => Math.min(6, v + 1)); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setOctave(v => Math.max(2, v - 1)); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const abcString = generateAbc(state);
  const noteCount = state.notes.length + (state.bassNotes?.length ?? 0);
  const curNotes  = state.useGrandStaff && activeStaff === 'bass' ? (state.bassNotes || []) : state.notes;
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-5 h-full p-3 md:p-5">

      {/* ════════════════════════════════
          왼쪽 사이드 패널
          - 모바일: 상단 접기/펴기 토글
          - PC: 320px 고정 사이드바
          ════════════════════════════════ */}

      {/* 모바일: 설정 토글 버튼 */}
      <div className="md:hidden">
        <button
          onClick={() => setLeftPanelOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-white rounded-xl border border-slate-200 shadow-sm text-sm font-medium text-slate-700"
        >
          <div className="flex items-center gap-2">
            <Settings2 size={15} className="text-slate-400" />
            <span>설정 / 재생 옵션 / 자동생성</span>
            <span className="text-xs text-slate-400">
              {state.keySignature} · {state.timeSignature} · {state.tempo}BPM
            </span>
          </div>
          {leftPanelOpen ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
        </button>
      </div>

      <div className={`md:w-80 md:shrink-0 flex flex-col gap-4 md:overflow-y-auto pb-4 ${leftPanelOpen ? 'flex' : 'hidden md:flex'}`}>

        {/* ── 악보 설정 ── */}
        <Card>
          <SectionHeader title="악보 설정" />
          <div className="p-4 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">제목</label>
              <input type="text" className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                value={state.title} onChange={e => setState(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">조성</label>
              <select className="w-full border rounded-lg px-2 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-400"
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
              <label className="block text-xs text-slate-500 mb-1">박자</label>
              <select className="w-full border rounded-lg px-2 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-400"
                value={state.timeSignature} onChange={e => setState(p => ({ ...p, timeSignature: e.target.value }))}>
                {['4/4','3/4','2/4','6/8','9/8'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">BPM</label>
              <input type="number" className="w-full border rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                value={state.tempo} onChange={e => setState(p => ({ ...p, tempo: parseInt(e.target.value) || 120 }))} min={40} max={240} />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={state.useGrandStaff ?? false}
                  onChange={e => setState(p => ({ ...p, useGrandStaff: e.target.checked, bassNotes: p.bassNotes || [] }))}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400" />
                <span className="text-sm text-slate-700 font-medium">큰보표</span>
              </label>
            </div>
          </div>
        </Card>

        {/* ── 재생 옵션 ── */}
        <Card>
          <SectionHeader title="재생 옵션" />
          <div className="p-4 flex flex-col gap-4">

            {/* 스케일 */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={prependBasePitch} onChange={e => setPrependBasePitch(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400" />
                <span className="text-sm font-medium text-slate-700">🎵 스케일</span>
              </label>
              {prependBasePitch && (
                <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1">
                  <span className="text-xs text-indigo-500 font-medium">BPM</span>
                  <input type="number" value={scaleTempo} onChange={e => setScaleTempo(Number(e.target.value))}
                    className="w-16 text-sm text-indigo-700 font-semibold bg-transparent outline-none text-right"
                    min={40} max={300} />
                </div>
              )}
            </div>

            {/* 메트로놈 */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={prependMetronome} onChange={e => setPrependMetronome(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400" />
                <span className="text-sm font-medium text-slate-700">🥁 메트로놈</span>
              </label>
              {prependMetronome && (
                <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1">
                  <span className="text-xs text-indigo-500 font-medium">Hz</span>
                  <input type="number" value={metronomeFreq} onChange={e => setMetronomeFreq(Number(e.target.value) || 1000)}
                    className="w-16 text-sm text-indigo-700 font-semibold bg-transparent outline-none text-right"
                    min={200} max={4000} />
                </div>
              )}
            </div>

            {/* 시험용 */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={examMode}
                  onChange={e => { setExamMode(e.target.checked); if (e.target.checked) { setPrependBasePitch(true); setPrependMetronome(true); } }}
                  className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400" />
                <span className="text-sm font-medium text-slate-700">📝 시험용</span>
              </label>
              {examMode && (
                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
                  <span className="text-xs text-amber-500 font-medium">대기(초)</span>
                  <input type="number" value={examWaitSeconds} onChange={e => setExamWaitSeconds(Math.max(0, Number(e.target.value) || 0))}
                    className="w-10 text-sm text-amber-700 font-semibold bg-transparent outline-none text-right"
                    min={0} max={30} />
                </div>
              )}
            </div>

          </div>
        </Card>

        {/* ── 자동 생성 ── */}
        <Card className="border-amber-200 bg-amber-50">
          <button className="w-full flex items-center justify-between px-4 py-3 rounded-t-xl"
            onClick={() => setShowGenPanel(v => !v)}>
            <div className="flex items-center gap-2">
              <Wand2 size={15} className="text-amber-500" />
              <span className="text-sm font-semibold text-amber-800">자동 생성</span>
              <span className="text-xs text-amber-500 bg-amber-100 px-2 py-0.5 rounded-full">
                {DIFF_LABELS[genDifficulty]} · {genMeasures}마디
              </span>
            </div>
            {showGenPanel ? <ChevronUp size={15} className="text-amber-400" /> : <ChevronDown size={15} className="text-amber-400" />}
          </button>

          {showGenPanel && (
            <div className="border-t border-amber-200 px-4 py-4 flex flex-col gap-4">
              <div>
                <p className="text-xs font-medium text-amber-700 mb-2">난이도</p>
                <div className="flex gap-1.5">
                  {(['beginner','intermediate','advanced'] as Difficulty[]).map(d => (
                    <button key={d} onClick={() => setGenDifficulty(d)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                        genDifficulty === d ? 'bg-amber-500 text-white shadow-sm' : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-100'
                      }`}>
                      {DIFF_LABELS[d]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-amber-600 mt-1.5">{DIFF_DESC[genDifficulty]}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-amber-700 mb-2">마디 수</p>
                <div className="flex gap-1.5">
                  {[4, 8, 12, 16].map(n => (
                    <button key={n} onClick={() => setGenMeasures(n)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                        genMeasures === n ? 'bg-amber-500 text-white shadow-sm' : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-100'
                      }`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleGenerate}
                className="w-full py-2.5 bg-amber-600 text-white rounded-lg font-semibold text-sm hover:bg-amber-700 active:scale-[0.98] transition-all shadow flex items-center justify-center gap-2">
                <RefreshCw size={15} /> 생성하기
              </button>
              <p className="text-[10px] text-amber-500 text-center">※ 현재 조성·박자·큰보표 설정 적용. 기존 음표는 교체됩니다.</p>
            </div>
          )}
        </Card>

        {/* ── 저장/불러오기 ── */}
        <Card>
          <SectionHeader title="악보 관리" />
          <div className="p-3 flex flex-col gap-2">
            <button onClick={handleSave}
              className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
              <Save size={14} /> 현재 악보 저장
            </button>
            <button onClick={() => setShowSavedList(v => !v)}
              className={`flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium transition-colors border ${
                showSavedList ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}>
              <FolderOpen size={14} /> 저장된 악보 {savedScores.length > 0 && `(${savedScores.length})`}
            </button>
          </div>
        </Card>

        {/* ── 저장 목록 ── */}
        {showSavedList && (
          <Card>
            <SectionHeader title="저장 목록">
              <button onClick={() => setShowSavedList(false)} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
            </SectionHeader>
            {savedScores.length === 0 ? (
              <p className="text-xs text-slate-400 p-5 text-center">저장된 악보가 없습니다.</p>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {savedScores.map(s => (
                  <li key={s.id} className="p-3 hover:bg-slate-50 transition-colors">
                    <p className="text-sm font-medium text-slate-700 truncate mb-0.5">{s.title}</p>
                    <p className="text-xs text-slate-400 mb-2">
                      {s.state.keySignature} · {s.state.timeSignature} · {s.state.tempo}BPM
                      <span className="ml-1.5">{new Date(s.savedAt).toLocaleDateString('ko-KR')}</span>
                    </p>
                    <div className="flex gap-1.5">
                      <button onClick={() => setPreviewScore(previewScore?.id === s.id ? null : s)}
                        className="flex-1 py-1 text-xs bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200 transition-colors">미리보기</button>
                      <button onClick={() => handleLoadScore(s)}
                        className="flex-1 py-1 text-xs bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100 transition-colors">열기</button>
                      <button onClick={() => handlePreviewDownloadImage(s)}
                        className="py-1 px-2.5 text-xs bg-emerald-50 text-emerald-600 rounded-md hover:bg-emerald-100 transition-colors"><Download size={11} /></button>
                      <button onClick={() => handleDeleteSaved(s.id)}
                        className="py-1 px-2.5 text-xs bg-red-50 text-red-500 rounded-md hover:bg-red-100 transition-colors"><Trash2 size={11} /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

      </div>

      {/* ════════════════════════════════
          오른쪽(또는 모바일: 아래쪽) 메인 영역
          ════════════════════════════════ */}
      <div className="flex-1 flex flex-col gap-4 min-w-0 md:overflow-y-auto pb-4">

        {/* ── 악보 표시 ── */}
        <Card>
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50 rounded-t-xl">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">악보</span>
            <div className="flex items-center gap-2">
              <button onClick={() => { if (scoreRef.current) svgToPng(scoreRef.current, state.title); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
                <Download size={12} /> 이미지
              </button>
              <button onClick={() => window.dispatchEvent(new CustomEvent('abcjs-download-audio', { detail: { title: state.title } }))}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                <FileAudio size={12} /> WAV 저장
              </button>
            </div>
          </div>
          <div ref={scoreRef} className="p-4 min-h-48">
            {noteCount === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-300 gap-2">
                <Music2 size={40} />
                <p className="text-sm">왼쪽 패널에서 자동생성하거나, 아래 팔레트로 음표를 입력하세요</p>
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
              />
            )}
          </div>
        </Card>

        {/* ── 미리보기 (저장 목록에서 선택 시) ── */}
        {previewScore && (
          <Card>
            <SectionHeader title={`미리보기: ${previewScore.title}`}>
              <button onClick={() => setPreviewScore(null)} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
            </SectionHeader>
            <div ref={previewScoreRef} className="p-4">
              <AbcjsRenderer abcString={generateAbc(previewScore.state)}
                timeSignature={previewScore.state.timeSignature}
                tempo={previewScore.state.tempo}
                keySignature={previewScore.state.keySignature} />
            </div>
          </Card>
        )}

        {/* ── 음표 입력 팔레트 ── */}
        <Card>
          <button className="w-full flex items-center justify-between px-4 py-2.5 rounded-t-xl"
            onClick={() => setPaletteOpen(v => !v)}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">음표 입력 팔레트</span>
              {noteCount > 0 && (
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {state.notes.length}개{state.useGrandStaff ? ` + 베이스 ${state.bassNotes?.length ?? 0}개` : ''}
                </span>
              )}
            </div>
            {paletteOpen ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
          </button>

          {paletteOpen && (
            <div className="border-t border-slate-100 p-4 flex flex-col gap-4">

              {/* 큰보표: 보표 선택 */}
              {state.useGrandStaff && (
                <div className="flex gap-2">
                  {(['treble','bass'] as const).map(s => (
                    <button key={s} onClick={() => setActiveStaff(s)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeStaff === s ? 'bg-indigo-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}>
                      {s === 'treble' ? '🎼 높은음자리' : '🎵 낮은음자리'}
                      <span className="ml-1.5 opacity-70 text-xs">
                        ({s === 'treble' ? state.notes.length : (state.bassNotes?.length ?? 0)})
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-3 items-start">
                {/* 음표 길이 */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">길이</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DURATIONS.map(d => (
                      <button key={d.value} onClick={() => setDuration(d.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          duration === d.value ? 'bg-indigo-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 변화표 */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">변화표</p>
                  <div className="flex gap-1.5">
                    {ACCIDENTALS.map(a => (
                      <button key={a.label} onClick={() => setAccidental(a.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          accidental === a.value ? 'bg-rose-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 옥타브 */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">옥타브</p>
                  <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg p-1">
                    <button onClick={() => setOctave(v => Math.max(2, v - 1))}
                      className="w-7 h-7 flex items-center justify-center bg-white rounded-md shadow-sm text-slate-700 font-bold hover:bg-slate-50 text-sm">−</button>
                    <span className="w-6 text-center text-sm font-bold text-slate-800">{octave}</span>
                    <button onClick={() => setOctave(v => Math.min(6, v + 1))}
                      className="w-7 h-7 flex items-center justify-center bg-white rounded-md shadow-sm text-slate-700 font-bold hover:bg-slate-50 text-sm">+</button>
                  </div>
                </div>

                {/* 이음표 */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">이음표</p>
                  <button onClick={() => setTie(v => !v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      tie ? 'bg-indigo-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    Tie {tie ? '켜짐' : '꺼짐'}
                  </button>
                </div>

                {/* 잇단음표 */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">잇단음표</p>
                  <div className="flex gap-1.5 items-center">
                    {([['', '없음'], ['3', '3연'], ['5', '5연'], ['6', '6연'], ['7', '7연']] as [TupletType, string][]).map(([v, l]) => (
                      <button key={v} onClick={() => { setTuplet(v); setTupletCounter(0); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          tuplet === v ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}>
                        {l}
                      </button>
                    ))}
                    {tuplet && <span className="text-xs text-amber-600 font-bold ml-1">({tupletCounter}/{tuplet})</span>}
                  </div>
                </div>
              </div>

              {/* 음표 버튼 */}
              <div className="flex gap-1.5 md:gap-2 items-center">
                {PITCHES.map(p => (
                  <button key={p} onClick={() => handleAddNote(p)}
                    className="flex-1 h-11 md:h-12 rounded-xl bg-white border-2 border-indigo-100 shadow-sm text-base md:text-lg font-bold text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300 active:scale-95 transition-all">
                    {p}
                  </button>
                ))}
                <div className="w-px h-8 bg-slate-200 mx-1" />
                <button onClick={() => handleAddNote('rest')}
                  className="px-4 h-12 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 font-medium hover:bg-slate-200 active:scale-95 transition-all text-sm whitespace-nowrap">
                  쉼표
                </button>
              </div>

              {/* 편집 버튼 + 단축키 */}
              <div className="flex items-center gap-2">
                <button onClick={handleUndo} disabled={curNotes.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-40 transition-all">
                  <Undo size={14} /> 되돌리기
                </button>
                <button onClick={handleClear} disabled={curNotes.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 disabled:opacity-40 transition-all">
                  <Trash2 size={14} /> 전체 삭제
                </button>
                <div className="ml-auto flex items-center gap-2.5 text-xs text-slate-400">
                  <Keyboard size={12} />
                  <span><kbd className="px-1.5 py-0.5 bg-slate-100 border rounded font-mono text-[11px]">1</kbd>~<kbd className="px-1.5 py-0.5 bg-slate-100 border rounded font-mono text-[11px]">7</kbd> = C~B</span>
                  <span><kbd className="px-1.5 py-0.5 bg-slate-100 border rounded font-mono text-[11px]">↑↓</kbd> 옥타브</span>
                </div>
              </div>
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}
