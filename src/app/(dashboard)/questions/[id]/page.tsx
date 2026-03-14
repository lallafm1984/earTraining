import { createClient } from '@/lib/supabase/server'
import { ArrowLeft, Trash2, Lock, Unlock } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { deleteQuestion, toggleLockQuestion } from '@/actions/questions'
import type { NoteEvent } from '@/components/sound/useSoundPlayer'
import type { QuestionRow, QuestionType } from '@/types/database'
import SoundPanelClient from './SoundPanelClient'

export default async function QuestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: rawQuestion } = await supabase
    .from('questions')
    .select('*')
    .eq('id', id)
    .single()

  const question = rawQuestion as QuestionRow | null

  if (!question) {
    notFound()
  }

  // midi_data 파싱
  const notes = (question.midi_data as unknown as NoteEvent[]) || []

  return (
    <div className="p-4 md:p-8 max-w-3xl w-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6 md:mb-8">
        <div className="flex items-center gap-3">
          <Link
            href="/questions"
            className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors hover:bg-gray-100"
            style={{ border: '1px solid var(--border)' }}
          >
            <ArrowLeft size={16} style={{ color: 'var(--muted)' }} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
                {question.title}
              </h1>
              {question.is_locked && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">잠금</span>
              )}
            </div>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
              {new Date(question.created_at).toLocaleDateString('ko-KR')} 출제
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <form action={toggleLockQuestion.bind(null, question.id, question.is_locked)}>
            <button
              type="submit"
              className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors hover:bg-gray-100"
              style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
              title={question.is_locked ? '잠금 해제' : '잠금'}
            >
              {question.is_locked ? <Lock size={16} /> : <Unlock size={16} />}
            </button>
          </form>
          <form action={deleteQuestion.bind(null, question.id)}>
            <button
              type="submit"
              className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors hover:bg-red-50"
              style={{ border: '1px solid var(--border)', color: 'var(--danger)' }}
              title="삭제"
            >
              <Trash2 size={16} />
            </button>
          </form>
        </div>
      </div>

      <div className="space-y-6">
        {/* 기본 정보 */}
        <Section title="문제 정보">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>유형</p>
              <p className="font-medium">{question.type}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>난이도</p>
              <p className="font-medium capitalize">{question.level}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>학년</p>
              <p className="font-medium">{question.grade ? `${question.grade}학년` : '-'}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>태그</p>
              <p className="font-medium">{question.tags.length > 0 ? question.tags.join(', ') : '-'}</p>
            </div>
          </div>
        </Section>

        {/* 음악 설정 */}
        <Section title="음악 설정">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>BPM</p>
              <p className="font-medium">{question.bpm}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>조성</p>
              <p className="font-medium">{question.key_signature || '-'}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>박자</p>
              <p className="font-medium">{question.time_signature || '-'}</p>
            </div>
            <div>
              <p className="text-xs mb-1" style={{ color: 'var(--muted)' }}>재생 제한</p>
              <p className="font-medium">{question.play_limit}회</p>
            </div>
          </div>
        </Section>

        {/* 사운드 패널 (미리보기) */}
        <Section title="문제 미리 듣기">
          <SoundPanelClient
            questionType={question.type as QuestionType}
            bpm={question.bpm}
            keySignature={question.key_signature || 'C'}
            timeSignature={question.time_signature || '4/4'}
            initialNotes={notes}
          />
        </Section>

        {/* 정답 및 해설 */}
        <Section title="정답 및 보기">
          <div className="space-y-4">
            <div>
              <p className="text-xs mb-1.5" style={{ color: 'var(--muted)' }}>정답</p>
              <div className="p-3 rounded-xl font-medium" style={{ background: '#dcfce7', color: '#166534' }}>
                {question.answer}
              </div>
            </div>

            {question.is_multiple_choice && question.choices && (
              <div>
                <p className="text-xs mb-1.5" style={{ color: 'var(--muted)' }}>보기</p>
                <div className="grid grid-cols-2 gap-2">
                  {(question.choices as string[]).map((choice, i) => (
                    <div
                      key={i}
                      className="p-2.5 rounded-lg text-sm border"
                      style={{
                        background: choice === question.answer ? '#dcfce7' : 'var(--background)',
                        borderColor: choice === question.answer ? '#86efac' : 'var(--border)',
                        color: choice === question.answer ? '#166534' : 'var(--foreground)',
                      }}
                    >
                      {choice}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      </div>
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
