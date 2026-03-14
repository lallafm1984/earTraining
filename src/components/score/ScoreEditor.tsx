'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ScoreState, ScoreNote, NoteDuration, Accidental, PitchName, TupletType, generateAbc, getTupletNoteDuration } from '@/lib/scoreUtils';
import AbcjsRenderer from './AbcjsRenderer';
import { Download, Trash2, Undo, FileAudio, Save, FolderOpen, X, Keyboard } from 'lucide-react';

function svgToPng(container: HTMLElement, title: string) {
  const svg = container.querySelector('svg');
  if (!svg) { alert('악보 SVG를 찾을 수 없습니다.'); return; }

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!clone.getAttribute('width') || !clone.getAttribute('height')) {
    const bbox = svg.getBoundingClientRect();
    clone.setAttribute('width', String(bbox.width));
    clone.setAttribute('height', String(bbox.height));
  }

  const data = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();

  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    const a = document.createElement('a');
    a.download = `${title || 'score'}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert('이미지 변환에 실패했습니다.');
  };
  img.src = url;
}

interface SavedScore {
  id: string;
  title: string;
  state: ScoreState;
  savedAt: string;
}

function getSavedScores(): SavedScore[] {
  if (typeof window === 'undefined') return [];
  try {
    const json = localStorage.getItem('ear-training-scores');
    return json ? JSON.parse(json) : [];
  } catch { return []; }
}

function persistScores(scores: SavedScore[]) {
  localStorage.setItem('ear-training-scores', JSON.stringify(scores));
}

const DURATIONS: { value: NoteDuration; label: string }[] = [
  { value: '1', label: '온음표' },
  { value: '2', label: '2분' },
  { value: '4', label: '4분' },
  { value: '8', label: '8분' },
  { value: '16', label: '16분' },
  { value: '2.', label: '점2분' },
  { value: '4.', label: '점4분' },
  { value: '8.', label: '점8분' },
];

const ACCIDENTALS: { value: Accidental; label: string }[] = [
  { value: '', label: '없음' },
  { value: '#', label: '♯ (샵)' },
  { value: 'b', label: '♭ (플랫)' },
  { value: 'n', label: '♮ (제자리)' },
];

const PITCHES: PitchName[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

export default function ScoreEditor() {
  const [state, setState] = useState<ScoreState>({
    title: '새 악보',
    keySignature: 'C',
    timeSignature: '4/4',
    tempo: 120,
    notes: [],
  });

  const [duration, setDuration] = useState<NoteDuration>('4');
  const [accidental, setAccidental] = useState<Accidental>('');
  const [octave, setOctave] = useState<number>(4);
  const [tie, setTie] = useState<boolean>(false);
  const [tuplet, setTuplet] = useState<TupletType>('');
  const [tupletCounter, setTupletCounter] = useState(0); // current note index in tuplet group

  // New audio options
  const [prependBasePitch, setPrependBasePitch] = useState<boolean>(false);
  const [prependMetronome, setPrependMetronome] = useState<boolean>(false);
  const [scaleTempo, setScaleTempo] = useState<number>(120);

  const [savedScores, setSavedScores] = useState<SavedScore[]>([]);
  const [showSavedList, setShowSavedList] = useState(false);
  const [previewScore, setPreviewScore] = useState<SavedScore | null>(null);

  const scoreRef = useRef<HTMLDivElement>(null);
  const previewScoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSavedScores(getSavedScores());
  }, []);

  const handleAddNote = (pitch: PitchName) => {
    const isRest = pitch === 'rest';
    const tupletCount = tuplet ? parseInt(tuplet, 10) : 0;
    const isFirstInTuplet = tuplet && !isRest && tupletCounter === 0;

    const newNote: ScoreNote = {
      id: Math.random().toString(36).substr(2, 9),
      pitch,
      octave: isRest ? 4 : octave,
      accidental: isRest ? '' : accidental,
      duration,
      tie: isRest ? false : tie,
      // Only the FIRST note in a tuplet group gets the tuplet marker
      tuplet: isFirstInTuplet ? tuplet : undefined,
      tupletSpan: isFirstInTuplet ? duration : undefined,
      tupletNoteDur: isFirstInTuplet ? getTupletNoteDuration(tuplet, duration) : undefined,
    };
    setState((prev) => ({ ...prev, notes: [...prev.notes, newNote] }));

    // Track tuplet group progress
    if (tuplet && !isRest) {
      const next = tupletCounter + 1;
      if (next >= tupletCount) {
        setTupletCounter(0); // group complete, reset for next group
      } else {
        setTupletCounter(next);
      }
    }
  };

  const handleUndo = () => {
    setState((prev) => ({ ...prev, notes: prev.notes.slice(0, -1) }));
  };

  const handleClear = () => {
    if (confirm('모든 음표를 지우시겠습니까?')) {
      setState((prev) => ({ ...prev, notes: [] }));
    }
  };

  const downloadImage = () => {
    if (!scoreRef.current) return;
    svgToPng(scoreRef.current, state.title);
  };

  const handleSave = useCallback(() => {
    const scores = getSavedScores();
    const newScore: SavedScore = {
      id: Date.now().toString(),
      title: state.title || '제목 없음',
      state: { ...state },
      savedAt: new Date().toISOString(),
    };
    scores.unshift(newScore);
    persistScores(scores);
    setSavedScores(scores);
    alert('악보가 저장되었습니다.');
  }, [state]);

  const handleLoadScore = useCallback((saved: SavedScore) => {
    setState(saved.state);
    setShowSavedList(false);
    setPreviewScore(null);
  }, []);

  const handleDeleteSaved = useCallback((id: string) => {
    if (!confirm('이 악보를 삭제하시겠습니까?')) return;
    const scores = getSavedScores().filter(s => s.id !== id);
    persistScores(scores);
    setSavedScores(scores);
    if (previewScore?.id === id) setPreviewScore(null);
  }, [previewScore]);

  const handlePreviewDownloadImage = useCallback((saved: SavedScore) => {
    setPreviewScore(saved);
    setTimeout(() => {
      if (!previewScoreRef.current) return;
      svgToPng(previewScoreRef.current, saved.title);
    }, 500);
  }, []);

  // ── 키보드 단축키 ──
  const handleAddNoteRef = useRef(handleAddNote);
  handleAddNoteRef.current = handleAddNote;

  useEffect(() => {
    const NOTE_KEY_MAP: Record<string, PitchName> = {
      '1': 'C', '2': 'D', '3': 'E', '4': 'F',
      '5': 'G', '6': 'A', '7': 'B',
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const pitch = NOTE_KEY_MAP[e.key];
      if (pitch) {
        e.preventDefault();
        handleAddNoteRef.current(pitch);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setOctave(prev => Math.min(6, prev + 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setOctave(prev => Math.max(3, prev - 1));
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const abcString = generateAbc(state);

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-20">
      
      {/* Configuration Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">제목</label>
          <input 
            type="text" 
            className="border rounded-md px-3 py-1.5 text-sm w-40 outline-none focus:ring-2 focus:ring-indigo-500"
            value={state.title}
            onChange={(e) => setState(prev => ({ ...prev, title: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">조성 (Key)</label>
          <select 
            className="border rounded-md px-3 py-1.5 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
            value={state.keySignature}
            onChange={(e) => setState(prev => ({ ...prev, keySignature: e.target.value }))}
          >
            <optgroup label="Major (장조)">
              <option value="C">C Major</option>
              <option value="G">G Major</option>
              <option value="D">D Major</option>
              <option value="A">A Major</option>
              <option value="F">F Major</option>
              <option value="Bb">Bb Major</option>
              <option value="Eb">Eb Major</option>
            </optgroup>
            <optgroup label="Minor (단조)">
              <option value="Am">A Minor</option>
              <option value="Em">E Minor</option>
              <option value="Bm">B Minor</option>
              <option value="F#m">F# Minor</option>
              <option value="Dm">D Minor</option>
              <option value="Gm">G Minor</option>
              <option value="Cm">C Minor</option>
            </optgroup>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">박자</label>
          <select 
            className="border rounded-md px-3 py-1.5 text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
            value={state.timeSignature}
            onChange={(e) => setState(prev => ({ ...prev, timeSignature: e.target.value }))}
          >
            <option value="4/4">4/4</option>
            <option value="3/4">3/4</option>
            <option value="2/4">2/4</option>
            <option value="6/8">6/8</option>
            <option value="9/8">9/8</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">빠르기 (BPM)</label>
          <input 
            type="number" 
            className="border rounded-md px-3 py-1.5 text-sm w-24 outline-none focus:ring-2 focus:ring-indigo-500"
            value={state.tempo}
            onChange={(e) => setState(prev => ({ ...prev, tempo: parseInt(e.target.value) || 120 }))}
            min={40} max={240}
          />
        </div>
      </div>

      {/* Note Input Palette */}
      <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">음표 추가 팔레트</h3>
        
        <div className="flex flex-col gap-5">
          {/* Options Row */}
          <div className="flex flex-wrap gap-6 items-center">
            {/* Durations */}
            <div className="flex bg-white border rounded-lg overflow-hidden shadow-sm">
              {DURATIONS.map(d => (
                <button
                  key={d.value}
                  onClick={() => setDuration(d.value)}
                  className={`px-3 py-2 text-sm transition-colors ${duration === d.value ? 'bg-indigo-500 text-white font-medium' : 'hover:bg-slate-100 text-slate-600'}`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* Accidentals */}
            <div className="flex bg-white border rounded-lg overflow-hidden shadow-sm">
              {ACCIDENTALS.map(a => (
                <button
                  key={a.label}
                  onClick={() => setAccidental(a.value)}
                  className={`px-3 py-2 text-sm transition-colors ${accidental === a.value ? 'bg-rose-500 text-white font-medium' : 'hover:bg-slate-100 text-slate-600'}`}
                >
                  {a.label}
                </button>
              ))}
            </div>

            {/* Octave */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 border rounded-lg shadow-sm">
              <span className="text-sm text-slate-600 font-medium">옥타브:</span>
              <button onClick={() => setOctave(prev => Math.max(3, prev - 1))} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs">-</button>
              <span className="w-4 text-center text-sm font-bold">{octave}</span>
              <button onClick={() => setOctave(prev => Math.min(6, prev + 1))} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs">+</button>
            </div>

            {/* Tie */}
            <button
              onClick={() => setTie(!tie)}
              className={`px-3 py-1.5 border rounded-lg shadow-sm text-sm transition-colors ${tie ? 'bg-indigo-500 text-white font-medium border-indigo-500' : 'bg-white hover:bg-slate-100 text-slate-600'}`}
            >
              이음표 (Tie)
            </button>

            {/* Tuplet (잇단음표) */}
            <div className="flex items-center gap-1 bg-white px-2 py-1 border rounded-lg shadow-sm">
              <span className="text-xs text-slate-500 font-medium mr-1">잇단음표:</span>
              {([['', '없음'], ['3', '3연음'], ['5', '5연음'], ['6', '6연음'], ['7', '7연음']] as [TupletType, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => { setTuplet(val); setTupletCounter(0); }}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    tuplet === val
                      ? 'bg-amber-500 text-white font-medium'
                      : 'hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
              {tuplet && (
                <span className="text-xs text-amber-600 font-medium ml-1">
                  ({tupletCounter}/{tuplet})
                </span>
              )}
            </div>
            
            <div className="ml-auto flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={prependBasePitch} 
                    onChange={(e) => setPrependBasePitch(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-500 focus:ring-indigo-500"
                  />
                  기본 음정(스케일) 추가
                </label>
                {prependBasePitch && (
                  <div className="flex items-center gap-1 ml-1 scale-90">
                    <span className="text-[10px] text-slate-400">BPM:</span>
                    <input 
                      type="number"
                      value={scaleTempo}
                      onChange={(e) => setScaleTempo(Number(e.target.value))}
                      className="w-12 px-1 py-0.5 text-xs border rounded bg-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      min="40"
                      max="300"
                    />
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={prependMetronome} 
                  onChange={(e) => setPrependMetronome(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-500 focus:ring-indigo-500"
                />
                메트로놈 추가
              </label>
            </div>

          </div>

          {/* Pitches */}
          <div className="flex flex-wrap gap-2 items-center">
            {PITCHES.map(p => (
              <button
                key={p}
                onClick={() => handleAddNote(p)}
                className="w-14 h-14 rounded-xl bg-white border-2 border-indigo-100 shadow-sm text-xl font-bold text-indigo-700 hover:bg-indigo-50 hover:border-indigo-300 transition-all active:scale-95 flex items-center justify-center"
              >
                {p}
              </button>
            ))}
            <div className="w-4" /> {/* separator */}
            <button
              onClick={() => handleAddNote('rest')}
              className="px-4 h-14 rounded-xl bg-slate-100 text-slate-600 border border-slate-300 font-medium hover:bg-slate-200 transition-all active:scale-95"
            >
              쉼표 넣기
            </button>

            <div className="mx-auto" />

            <button
              onClick={handleUndo}
              disabled={state.notes.length === 0}
              className="flex items-center gap-1.5 px-4 h-10 rounded-lg bg-white border text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              <Undo size={16} /> 되돌리기
            </button>
            <button
              onClick={handleClear}
              disabled={state.notes.length === 0}
              className="flex items-center gap-1.5 px-4 h-10 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              <Trash2 size={16} /> 전체 지우기
            </button>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 shadow-md transition-colors"
        >
          <Save size={16} /> 악보 저장
        </button>
        <button
          onClick={() => setShowSavedList(!showSavedList)}
          className="flex items-center gap-2 bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 shadow-sm transition-colors"
        >
          <FolderOpen size={16} /> 저장된 악보 ({savedScores.length})
        </button>
        <div className="flex-1" />
        <button
          onClick={downloadImage}
          className="flex items-center gap-2 bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 shadow-sm transition-colors"
        >
          <Download size={16} /> 이미지 다운로드
        </button>
        <button
          onClick={() => {
            const ev = new CustomEvent('abcjs-download-audio', { detail: { title: state.title } });
            window.dispatchEvent(ev);
          }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-md transition-colors"
        >
          <FileAudio size={16} /> WAV 음원 저장
        </button>
      </div>

      {/* Saved Scores List */}
      {showSavedList && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-700">저장된 악보 목록</h3>
            <button onClick={() => setShowSavedList(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          {savedScores.length === 0 ? (
            <p className="text-sm text-slate-400 p-6 text-center">저장된 악보가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {savedScores.map(s => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{s.title}</p>
                    <p className="text-xs text-slate-400">
                      {s.state.keySignature} · {s.state.timeSignature} · {s.state.tempo}BPM
                      <span className="ml-2">{new Date(s.savedAt).toLocaleDateString('ko-KR')}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => setPreviewScore(previewScore?.id === s.id ? null : s)}
                    className="px-2.5 py-1.5 text-xs bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200 transition-colors"
                  >
                    미리보기
                  </button>
                  <button
                    onClick={() => handleLoadScore(s)}
                    className="px-2.5 py-1.5 text-xs bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100 transition-colors"
                  >
                    열기
                  </button>
                  <button
                    onClick={() => handlePreviewDownloadImage(s)}
                    className="px-2.5 py-1.5 text-xs bg-emerald-50 text-emerald-600 rounded-md hover:bg-emerald-100 transition-colors"
                  >
                    <Download size={12} />
                  </button>
                  <button
                    onClick={() => handleDeleteSaved(s.id)}
                    className="px-2.5 py-1.5 text-xs bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Preview of saved score */}
      {previewScore && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="text-sm font-semibold text-slate-700">미리보기: {previewScore.title}</h3>
            <button onClick={() => setPreviewScore(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          <div ref={previewScoreRef} className="p-4">
            <AbcjsRenderer
              abcString={generateAbc(previewScore.state)}
              timeSignature={previewScore.state.timeSignature}
              tempo={previewScore.state.tempo}
              keySignature={previewScore.state.keySignature}
            />
          </div>
        </div>
      )}

      {/* Rendered Score Area */}
      <div ref={scoreRef} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <AbcjsRenderer 
          abcString={abcString} 
          prependBasePitch={prependBasePitch}
          prependMetronome={prependMetronome}
          timeSignature={state.timeSignature}
          tempo={state.tempo}
          scaleTempo={scaleTempo}
          keySignature={state.keySignature}
        />
      </div>

      {/* Shortcut Reference */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-6 text-xs text-slate-500">
        <span className="flex items-center gap-1.5 font-medium text-slate-600"><Keyboard size={14} /> 단축키</span>
        <span><kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px] font-mono">1</kbd>~<kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px] font-mono">7</kbd> = C~B</span>
        <span><kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px] font-mono">↑</kbd> 옥타브+</span>
        <span><kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px] font-mono">↓</kbd> 옥타브-</span>
      </div>
    </div>
  );
}
