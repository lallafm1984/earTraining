import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PlusCircle, BookOpen } from 'lucide-react'
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

  void params // 필터 UI 연동을 위해 params 참조 유지

  return (
    <div className="p-4 md:p-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold hidden md:block" style={{ color: 'var(--foreground)' }}>
            문제 은행
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            총 {questions?.length ?? 0}개의 문제
          </p>
        </div>
        <Link
          href="/questions/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white"
          style={{ background: 'var(--primary)' }}
        >
          <PlusCircle size={16} />
          새 문제 출제
        </Link>
      </div>

      {/* 필터 */}
      <QuestionFilters />

      {/* 문제 목록 */}
      <div
        className="rounded-2xl overflow-hidden mt-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {questions && questions.length > 0 ? (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  문제 제목
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  유형
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  난이도
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  학년
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  태그
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  출제일
                </th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {questions.map((q, i) => (
                <tr
                  key={q.id}
                  style={{
                    borderBottom: i < questions.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {q.is_locked && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{ background: '#f3f4f6', color: 'var(--muted)' }}
                        >
                          잠금
                        </span>
                      )}
                      <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                        {q.title}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--muted)' }}>
                    {typeLabels[q.type] ?? q.type}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                      style={{ background: levelColors[q.level] }}
                    >
                      {levelLabels[q.level] ?? q.level}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--muted)' }}>
                    {q.grade ? `${q.grade}학년` : '-'}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {q.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: '#EEF2FF', color: 'var(--primary)' }}
                        >
                          {tag}
                        </span>
                      ))}
                      {q.tags.length > 3 && (
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>
                          +{q.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--muted)' }}>
                    {new Date(q.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/questions/${q.id}`}
                      className="text-xs font-medium"
                      style={{ color: 'var(--primary)' }}
                    >
                      보기
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          <div className="py-16 text-center">
            <BookOpen size={48} className="mx-auto mb-4" style={{ color: 'var(--border)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
              {params.type || params.level || params.q
                ? '검색 조건에 맞는 문제가 없습니다.'
                : '아직 출제된 문제가 없습니다.'}
            </p>
            {!params.type && !params.level && !params.q && (
              <Link
                href="/questions/new"
                className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium"
                style={{ color: 'var(--primary)' }}
              >
                <PlusCircle size={14} />
                첫 문제 출제하기
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
