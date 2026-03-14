import { createClient } from '@/lib/supabase/server'
import { Music2, PlusCircle } from 'lucide-react'
import Link from 'next/link'

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
    .order('created_at', { ascending: false })

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold hidden md:block" style={{ color: 'var(--foreground)' }}>
            수업 세션
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            총 {sessions?.length ?? 0}개의 세션
          </p>
        </div>
        <Link
          href="/sessions/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white"
          style={{ background: 'var(--primary)' }}
        >
          <PlusCircle size={16} />
          새 세션 만들기
        </Link>
      </div>

      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {sessions && sessions.length > 0 ? (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  세션 제목
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  문제 세트
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  공유 코드
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  상태
                </th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                  생성일
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <tr
                  key={s.id}
                  style={{
                    borderBottom: i < sessions.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <td className="px-5 py-3.5 text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                    {s.title}
                  </td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--muted)' }}>
                    {s.question_sets?.title ?? '-'}
                  </td>
                  <td className="px-5 py-3.5">
                    <code
                      className="text-sm font-mono px-2 py-1 rounded-lg font-bold"
                      style={{ background: '#EEF2FF', color: 'var(--primary)' }}
                    >
                      {s.share_code}
                    </code>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{
                        background: s.is_active ? '#dcfce7' : '#f3f4f6',
                        color: s.is_active ? '#16a34a' : 'var(--muted)',
                      }}
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
        ) : (
          <div className="py-16 text-center">
            <Music2 size={48} className="mx-auto mb-4" style={{ color: 'var(--border)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
              아직 수업 세션이 없습니다.
            </p>
            <Link
              href="/sessions/new"
              className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium"
              style={{ color: 'var(--primary)' }}
            >
              <PlusCircle size={14} />
              첫 세션 만들기
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
