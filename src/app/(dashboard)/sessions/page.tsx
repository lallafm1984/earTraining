import { createClient } from '@/lib/supabase/server'
import { Music2, PlusCircle, CalendarDays } from 'lucide-react'
import Link from 'next/link'
import type { SessionRow } from '@/types/database'

export default async function SessionsPage() {
  const supabase = await createClient()
  const { data: sessions } = await supabase
    .from('sessions')
    .select(`
      id,
      title,
      share_code,
      is_active,
      created_at,
      question_sets (
        title
      )
    `)
    .order('created_at', { ascending: false }) as {
      data: (SessionRow & {
        question_sets: { title: string } | null
      })[] | null
    }

  return (
    <div className="p-4 md:p-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold hidden md:block" style={{ color: 'var(--foreground)' }}>
            수업 세션
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            총 <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{sessions?.length ?? 0}</span>개의 세션
          </p>
        </div>
        {/* PC 신규 버튼 (모바일은 MobileHeader에) */}
        <Link
          href="/sessions/new"
          className="hidden md:flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white"
          style={{ background: 'var(--primary)' }}
        >
          <PlusCircle size={16} />
          새 세션 만들기
        </Link>
      </div>

      {sessions && sessions.length > 0 ? (
        <>
          {/* 모바일: 카드 목록 */}
          <div className="flex flex-col gap-3 md:hidden">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="rounded-2xl p-4"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                {/* 상단: 제목 + 상태 배지 */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        background: s.is_active ? '#dcfce7' : 'var(--background)',
                        color: s.is_active ? '#16a34a' : 'var(--muted)',
                      }}
                    >
                      <CalendarDays size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: 'var(--foreground)' }}>
                        {s.title}
                      </p>
                      {s.question_sets?.title && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>
                          {s.question_sets.title}
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
                    style={{
                      background: s.is_active ? '#dcfce7' : '#f3f4f6',
                      color: s.is_active ? '#16a34a' : 'var(--muted)',
                    }}
                  >
                    {s.is_active ? '진행 중' : '종료'}
                  </span>
                </div>

                {/* 하단: 공유 코드 + 날짜 */}
                <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>공유 코드</span>
                    <code
                      className="text-sm font-mono font-bold px-2.5 py-1 rounded-lg"
                      style={{ background: '#EEF2FF', color: 'var(--primary)' }}
                    >
                      {s.share_code}
                    </code>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {new Date(s.created_at).toLocaleDateString('ko-KR')}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* PC: 테이블 */}
          <div
            className="hidden md:block rounded-2xl overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>세션 제목</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>문제 세트</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>공유 코드</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>상태</th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>생성일</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s, i) => (
                    <tr
                      key={s.id}
                      style={{ borderBottom: i < sessions.length - 1 ? '1px solid var(--border)' : 'none' }}
                    >
                      <td className="px-5 py-3.5 text-sm font-medium" style={{ color: 'var(--foreground)' }}>{s.title}</td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--muted)' }}>{s.question_sets?.title ?? '-'}</td>
                      <td className="px-5 py-3.5">
                        <code className="text-sm font-mono px-2 py-1 rounded-lg font-bold" style={{ background: '#EEF2FF', color: 'var(--primary)' }}>
                          {s.share_code}
                        </code>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ background: s.is_active ? '#dcfce7' : '#f3f4f6', color: s.is_active ? '#16a34a' : 'var(--muted)' }}
                        >
                          {s.is_active ? '진행 중' : '종료'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--muted)' }}>
                        {new Date(s.created_at).toLocaleDateString('ko-KR')}
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
          className="rounded-2xl py-14 px-4 text-center"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <Music2 size={44} className="mx-auto mb-3" style={{ color: 'var(--border)' }} />
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--foreground)' }}>
            아직 수업 세션이 없습니다.
          </p>
          <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
            세션을 만들고 공유 코드로 학생들을 초대하세요.
          </p>
          <Link
            href="/sessions/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white active:scale-95 transition-transform"
            style={{ background: 'var(--primary)', WebkitTapHighlightColor: 'transparent' }}
          >
            <PlusCircle size={14} />
            첫 세션 만들기
          </Link>
        </div>
      )}
    </div>
  )
}
