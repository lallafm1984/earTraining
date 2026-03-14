'use client'

import { useState } from 'react'
import { createQuestion } from '@/actions/questions'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Info } from 'lucide-react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { NoteEvent } from '@/components/sound/useSoundPlayer'

// Tone.js는 SSR 불가 → dynamic import
const SoundPanel = dynamic(() => import('@/components/sound/SoundPanel'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-8 text-sm" style={{ color: 'var(--muted)' }}>
      사운드 엔진 로딩 중...
    </div>
  ),
})

type SoundQuestionType =
  | 'TYPE-01' | 'TYPE-02' | 'TYPE-03'
  | 'TYPE-04' | 'TYPE-05' | 'TYPE-06'

const questionTypes = [
  { value: 'TYPE-01', label: '단음 식별', desc: '단일 음을 듣고 음이름 선택' },
  { value: 'TYPE-02', label: '음정 식별', desc: '두 음 사이 간격 구분' },
  { value: 'TYPE-03', label: '화음 식별', desc: '화음 성질 구분' },
  { value: 'TYPE-04', label: '리듬 받아쓰기', desc: '리듬 패턴 선택' },
  { value: 'TYPE-05', label: '선율 받아쓰기', desc: '선율 구절 음 선택' },
  { value: 'TYPE-06', label: '조성 식별', desc: '장조/단조 및 으뜸음 판별' },
]

const levels = [
  { value: 'beginner', label: '초급', desc: '1학년 / 처음 배우는 학생', color: '#22c55e' },
  { value: 'intermediate', label: '중급', desc: '2학년 / 기초 이수 학생', color: '#f59e0b' },
  { value: 'advanced', label: '고급', desc: '3학년 / 심화 학생', color: '#ef4444' },
]

const keys = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']
const timeSignatures = ['4/4', '3/4', '2/4', '6/8', '9/8', '12/8', '5/4', '7/8']

export default function NewQuestionPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isMultipleChoice, setIsMultipleChoice] = useState(true)
  const [selectedType, setSelectedType] = useState('TYPE-01')
  const [bpm, setBpm] = useState(80)
  const [keySignature, setKeySignature] = useState('C')
  const [timeSignature, setTimeSignature] = useState('4/4')
  const [notes, setNotes] = useState<NoteEvent[]>([])

  async function handleSubmit(formData: FormData) {
    setError(null)
    setLoading(true)
    const result = await createQuestion(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl w-full">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6 md:mb-8">
        <Link
          href="/questions"
          className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors hover:bg-gray-100"
          style={{ border: '1px solid var(--border)' }}
        >
          <ArrowLeft size={16} style={{ color: 'var(--muted)' }} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
            새 문제 출제
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            문제를 작성하고 문제 은행에 등록합니다.
          </p>
        </div>
      </div>

      <form action={handleSubmit} className="space-y-6">
        {/* 문제 제목 */}
        <Section title="문제 제목">
          <input
            name="title"
            type="text"
            required
            placeholder="예) C장조 3화음 식별 - 기초"
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
            style={{
              background: 'var(--background)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
        </Section>

        {/* 문제 유형 */}
        <Section title="문제 유형">
          <input type="hidden" name="type" value={selectedType} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {questionTypes.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setSelectedType(t.value)}
                className="text-left px-4 py-3 rounded-xl border transition-all"
                style={{
                  background: selectedType === t.value ? '#EEF2FF' : 'var(--background)',
                  borderColor: selectedType === t.value ? 'var(--primary)' : 'var(--border)',
                }}
              >
                <p
                  className="text-sm font-semibold"
                  style={{ color: selectedType === t.value ? 'var(--primary)' : 'var(--foreground)' }}
                >
                  {t.label}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                  {t.desc}
                </p>
              </button>
            ))}
          </div>
        </Section>

        {/* 난이도 & 학년 */}
        <Section title="난이도 및 학년">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-48">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
                난이도 *
              </label>
              <select
                name="level"
                required
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
              >
                {levels.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label} — {l.desc}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-32">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
                학년 (선택)
              </label>
              <select
                name="grade"
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
              >
                <option value="">전체</option>
                <option value="1">1학년</option>
                <option value="2">2학년</option>
                <option value="3">3학년</option>
              </select>
            </div>
          </div>
        </Section>

        {/* 음악 설정 */}
        <Section title="음악 설정">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
                BPM
              </label>
              <input
                name="bpm"
                type="number"
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                min={40}
                max={200}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
                조성
              </label>
              <select
                name="key_signature"
                value={keySignature}
                onChange={(e) => setKeySignature(e.target.value || 'C')}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
              >
                <option value="">선택 안함</option>
                {keys.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
                박자
              </label>
              <select
                name="time_signature"
                value={timeSignature}
                onChange={(e) => setTimeSignature(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
              >
                <option value="">선택 안함</option>
                {timeSignatures.map((ts) => (
                  <option key={ts} value={ts}>{ts}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
                재생 제한 횟수
              </label>
              <input
                name="play_limit"
                type="number"
                defaultValue={3}
                min={1}
                max={10}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>
          </div>
        </Section>

        {/* 소리 미리 듣기 */}
        <Section title="소리 미리 듣기">
          <input type="hidden" name="midi_data" value={JSON.stringify(notes)} />
          <SoundPanel
            questionType={selectedType as SoundQuestionType}
            bpm={bpm}
            keySignature={keySignature}
            timeSignature={timeSignature}
            onNotesChange={setNotes}
          />
        </Section>

        {/* 정답 설정 */}
        <Section title="정답 설정">
          {/* 답안 유형 */}
          <div className="flex gap-4 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="is_multiple_choice"
                value="true"
                checked={isMultipleChoice}
                onChange={() => setIsMultipleChoice(true)}
                style={{ accentColor: 'var(--primary)' }}
              />
              <span className="text-sm" style={{ color: 'var(--foreground)' }}>객관식</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="is_multiple_choice"
                value="false"
                checked={!isMultipleChoice}
                onChange={() => setIsMultipleChoice(false)}
                style={{ accentColor: 'var(--primary)' }}
              />
              <span className="text-sm" style={{ color: 'var(--foreground)' }}>주관식</span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
              정답 *
            </label>
            <input
              name="answer"
              type="text"
              required
              placeholder="예) 장3화음, C장조, 단2도..."
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{
                background: 'var(--background)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
            />
          </div>

          {isMultipleChoice && (
            <div className="mt-3">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
                오답 선택지 (한 줄에 하나씩)
              </label>
              <textarea
                name="choices"
                rows={4}
                placeholder={'단2도\n장2도\n단3도\n장3도'}
                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
              />
              <p className="flex items-center gap-1 text-xs mt-1.5" style={{ color: 'var(--muted)' }}>
                <Info size={11} />
                정답을 포함한 모든 선택지를 입력하거나, 오답만 입력하세요.
              </p>
            </div>
          )}
        </Section>

        {/* 태그 */}
        <Section title="태그 (선택)">
          <input
            name="tags"
            type="text"
            placeholder="예) C장조, 4/4박자, 3화음 (쉼표로 구분)"
            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
            style={{
              background: 'var(--background)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
        </Section>

        {error && (
          <div
            className="px-4 py-3 rounded-xl text-sm"
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: 'var(--danger)',
            }}
          >
            {error}
          </div>
        )}

        {/* 버튼 */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'var(--primary)' }}
          >
            {loading ? '저장 중...' : '문제 은행에 저장'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-3 rounded-xl text-sm font-medium"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            }}
          >
            취소
          </button>
        </div>
      </form>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--foreground)' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}
