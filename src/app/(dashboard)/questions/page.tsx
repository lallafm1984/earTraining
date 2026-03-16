import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PlusCircle, BookOpen, ChevronRight, Lock } from 'lucide-react'
import QuestionFilters from './QuestionFilters'
import type { QuestionRow } from '@/types/database'

type QuestionListItem = Pick<QuestionRow, 'id' | 'title' | 'type' | 'level' | 'grade' | 'tags' | 'is_locked' | 'created_at'>

const typeLabels: Record<string, string> = {
  'TYPE-01': '단음 식별',
  'TYPE-02': '음정 식별',
  'TYPE-03': '화음 식별',
  'TYPE-04': '리듬 받아쓰기',
  'TYPE-05': '선율 받아쓰기',
  'TYPE-06': '조성 식별',
}

// 유형별 아이콘 이모지
const typeEmoji: Record<string, string> = {
  'TYPE-01': '🎵',
  'TYPE-02': '🎶',
  'TYPE-03': '🎸',
  'TYPE-04': '🥁',
  'TYPE-05': '🎼',
  'TYPE-06': '🎹',
}

const levelLabels: Record<string, string> = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급',
}

const levelColors: Record<string, string> = {
  beginner: '#22c55e',
  intermediate: '#f59e0b',
  advanced: '#ef4444',
}

type SearchParams = {
  type?: string
  level?: string
  q?: string
}

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams

  const supabase = await createClient()
  let query = supabase.from('questions').select('*').order('created_at', { ascending: false })

  if (params.type) query = query.eq('type', params.type)
  if (params.level) query = query.eq('level', params.level)
  if (params.q) query = query.ilike('title', `%${params.q}%`)

  const { data: rawQuestions } = await query
  const questions = (rawQuestions as QuestionListItem[]) || []

  void params

  return (
    <div className="p-4 md:p-8">
      {/* 헤더 — PC만 제목 표시 (모바일은 MobileHeader에서) */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold hidden md:block" style={{ color: 'var(--foreground)' }}>
            문제 은행
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            총 <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{questions?.length ?? 0}</span>개의 문제
          </p>
        </div>
        {/* PC 신규 버튼 (모바일은 MobileHeader에 있음) */}
        <Link
          href="/questions/new"
          className="hidden md:flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white"
          style={{ background: 'var(--primary)' }}
        >
          <PlusCircle size={16} />
          새 문제 출제
        </Link>
      </div>

      {/* 필터 */}
      <QuestionFilters />

      {/* 문제 목록 */}
      {questions && questions.length > 0 ? (
        <>
          {/* 모바일: 카드 목록 */}
          <div className="flex flex-col gap-2 mt-4 md:hidden">
            {questions.map((q) => (
              <Link
                key={q.id}
                href={`/questions/${q.id}`}
                className="flex items-center gap-3 p-4 rounded-2xl active:scale-98 transition-transform"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {/* 유형 아이콘 */}
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl"
                  style={{ background: 'var(--primary)10' }}
                >
                  {typeEmoji[q.type] ?? '📝'}
                </div>

                {/* 내용 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {q.is_locked && (
                      <Lock size={11} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    )}
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--foreground)' }}>
                      {q.title}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      {typeLabels[q.type] ?? q.type}
                    </span>
                    {q.grade && (
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>
                        · {q.grade}학년
                      </span>
                    )}
                    {q.tags.length > 0 && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full"
                        style={{ background: '#EEF2FF', color: 'var(--primary)' }}
                      >
                        {q.tags[0]}
                        {q.tags.length > 1 && ` +${q.tags.length - 1}`}
                      </span>
                    )}
                  </div>
                </div>

                {/* 오른쪽: 난이도 + 화살표 */}
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ background: levelColors[q.level] }}
                  >
                    {levelLabels[q.level] ?? q.level}
                  </span>
                  <ChevronRight size={14} style={{ color: 'var(--muted)' }} />
                </div>
              </Link>
            ))}
          </div>

          {/* PC: 테이블 */}
          <div
            className="hidden md:block rounded-2xl overflow-hidden mt-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>문제 제목</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>유형</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>난이도</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>학년</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>태그</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>출제일</th>
                    <th className="px-5 py-3.5" />
                  </tr>
                </thead>
                <tbody>
                  {questions.map((q, i) => (
                    <tr
                      key={q.id}
                      style={{ borderBottom: i < questions.length - 1 ? '1px solid var(--border)' : 'none' }}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          {q.is_locked && (
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#f3f4f6', color: 'var(--muted)' }}>
                              잠금
                            </span>
                          )}
                          <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{q.title}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--muted)' }}>{typeLabels[q.type] ?? q.type}</td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ background: levelColors[q.level] }}>
                          {levelLabels[q.level] ?? q.level}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--muted)' }}>{q.grade ? `${q.grade}학년` : '-'}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {q.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#EEF2FF', color: 'var(--primary)' }}>
                              {tag}
                            </span>
                          ))}
                          {q.tags.length > 3 && <span className="text-xs" style={{ color: 'var(--muted)' }}>+{q.tags.length - 3}</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--muted)' }}>
                        {new Date(q.created_at).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-5 py-3.5">
                        <Link href={`/questions/${q.id}`} className="text-xs font-medium" style={{ color: 'var(--primary)' }}>
                          보기
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div
          className="rounded-2xl py-14 px-4 text-center mt-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <BookOpen size={44} className="mx-auto mb-3" style={{ color: 'var(--border)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
            {params.type || params.level || params.q
              ? '검색 조건에 맞는 문제가 없습니다.'
              : '아직 출제된 문제가 없습니다.'}
          </p>
          {!params.type && !params.level && !params.q && (
            <Link
              href="/questions/new"
              className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl text-sm font-semibold text-white active:scale-95 transition-transform"
              style={{ background: 'var(--primary)', WebkitTapHighlightColor: 'transparent' }}
            >
              <PlusCircle size={14} />
              첫 문제 출제하기
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
