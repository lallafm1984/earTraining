'use client';

import React, { useState, useRef, useId } from 'react';
import { ScoreState, ScoreNote, NoteDuration, Accidental, PitchName, TupletType, generateAbc, getTupletNoteDuration } from '@/lib/scoreUtils';
import AbcjsRenderer from './AbcjsRenderer';
import html2canvas from 'html2canvas';
import { Download, Trash2, Undo, FileAudio } from 'lucide-react';

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

  const scoreRef = useRef<HTMLDivElement>(null);

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

  const downloadImage = async () => {
    if (!scoreRef.current) return;
    try {
      const canvas = await html2canvas(scoreRef.current, { scale: 2 });
      const dlLink = document.createElement('a');
      dlLink.download = `${state.title || 'score'}.png`;
      dlLink.href = canvas.toDataURL('image/png');
      dlLink.click();
    } catch (err) {
      console.error('Failed to capture score image', err);
      alert('이미지 다운로드에 실패했습니다.');
    }
  };

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
            <option value="C">C Major / A Minor</option>
            <option value="G">G Major / E Minor</option>
            <option value="D">D Major / B Minor</option>
            <option value="A">A Major / F# Minor</option>
            <option value="F">F Major / D Minor</option>
            <option value="Bb">Bb Major / G Minor</option>
            <option value="Eb">Eb Major / C Minor</option>
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
            
            <div className="ml-auto flex gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={prependBasePitch} 
                  onChange={(e) => setPrependBasePitch(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-500 focus:ring-indigo-500"
                />
                기본 음정(스케일) 추가
              </label>
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

      {/* Rendered Score Area */}
      <div className="relative">
        <div className="absolute top-4 right-4 z-10 flex gap-2">
           <button
             onClick={downloadImage}
             className="flex items-center gap-2 bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 shadow-sm transition-colors"
           >
             <Download size={16} /> 이미지
           </button>
           <button
             onClick={() => {
               const ev = new CustomEvent('abcjs-download-audio', { detail: { title: state.title } });
               window.dispatchEvent(ev);
             }}
             className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-md transition-colors"
           >
             <FileAudio size={16} /> MP3/WAV 음원 저장
           </button>
        </div>
        
        {/* The area to capture */}
        <div ref={scoreRef} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 pt-16">
          <AbcjsRenderer 
            abcString={abcString} 
            prependBasePitch={prependBasePitch}
            prependMetronome={prependMetronome}
            timeSignature={state.timeSignature}
            tempo={state.tempo}
          />
          <div className="text-center mt-4 text-xs text-slate-400">
            Rendered with abcjs
          </div>
        </div>
      </div>
    </div>
  );
}
