// TODO: 테스트 모드 — Supabase 연결 없이 mock 데이터로 동작
// 실서비스 전환 시 하단 주석 처리된 코드를 복원하세요
import { BookOpen, Music2, PlusCircle, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import type { QuestionRow } from '@/types/database'

type RecentQuestion = Pick<QuestionRow, 'id' | 'title' | 'type' | 'level' | 'created_at'>

export default async function DashboardPage() {
  // 테스트용 mock 데이터
  const profile = { name: '테스트 선생님' }
  const questionCount = 0
  const setCount = 0
  const sessionCount = 0
  const recentQuestions: RecentQuestion[] = []

  // --- 운영 코드 (비활성화 중) ---
  // const supabase = await createClient()
  // const { data: { user } } = await supabase.auth.getUser()
  // const { data: profileData } = await supabase.from('profiles').select('name').eq('id', user!.id).single()
  // const profile = profileData as { name: string } | null
  // const [{ count: questionCount }, { count: setCount }, { count: sessionCount }] = await Promise.all([...])
  // const { data: rawRecentQuestions } = await supabase.from('questions').select(...).limit(5)
  // const recentQuestions = rawRecentQuestions as RecentQuestion[] | null
  // ---

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

  return (
    <div className="p-4 md:p-8">
      {/* 헤더 — 모바일에서는 MobileHeader가 타이틀을 대신하므로 숨김 */}
      <div className="mb-6 hidden md:block">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
          안녕하세요, {profile?.name ?? '선생님'} 👋
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          오늘도 좋은 수업 되세요.
        </p>
      </div>
      {/* 모바일 인사 */}
      <div className="mb-4 md:hidden">
        <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
          안녕하세요, {profile?.name ?? '선생님'} 👋 오늘도 좋은 수업 되세요.
        </p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          icon={<BookOpen size={20} />}
          label="전체 문제"
          value={questionCount ?? 0}
          unit="개"
          color="var(--primary)"
        />
        <StatCard
          icon={<TrendingUp size={20} />}
          label="문제 세트"
          value={setCount ?? 0}
          unit="개"
          color="#8b5cf6"
        />
        <StatCard
          icon={<Music2 size={20} />}
          label="수업 세션"
          value={sessionCount ?? 0}
          unit="개"
          color="var(--accent)"
        />
      </div>

      {/* 빠른 액션 */}
      <div className="mb-6">
        <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--foreground)' }}>
          빠른 메뉴
        </h2>
        <div className="flex flex-wrap gap-2 md:gap-3">
          <Link
            href="/questions/new"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white"
            style={{ background: 'var(--primary)' }}
          >
            <PlusCircle size={16} />
            새 문제 출제
          </Link>
          <Link
            href="/questions"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            }}
          >
            <BookOpen size={16} />
            문제 은행 보기
          </Link>
          <Link
            href="/sessions"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            }}
          >
            <Music2 size={16} />
            세션 관리
          </Link>
        </div>
      </div>

      {/* 최근 문제 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>
            최근 출제 문제
          </h2>
          <Link
            href="/questions"
            className="text-sm font-medium"
            style={{ color: 'var(--primary)' }}
          >
            전체 보기
          </Link>
        </div>

        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {recentQuestions && recentQuestions.length > 0 ? (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left px-5 py-3 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                    문제 제목
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                    유형
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                    난이도
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                    출제일
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentQuestions.map((q, i) => (
                  <tr
                    key={q.id}
                    style={{
                      borderBottom: i < recentQuestions.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <td className="px-5 py-3.5 text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                      <Link href={`/questions/${q.id}`} className="hover:underline">
                        {q.title}
                      </Link>
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
                      {new Date(q.created_at).toLocaleDateString('ko-KR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          ) : (
            <div className="py-12 text-center">
              <BookOpen size={40} className="mx-auto mb-3" style={{ color: 'var(--border)' }} />
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                아직 출제된 문제가 없습니다.
              </p>
              <Link
                href="/questions/new"
                className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium"
                style={{ color: 'var(--primary)' }}
              >
                <PlusCircle size={14} />
                첫 문제 출제하기
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  unit,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  unit: string
  color: string
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
          {label}
        </span>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: color + '18', color }}
        >
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold" style={{ color: 'var(--foreground)' }}>
        {value}
        <span className="text-base font-medium ml-1" style={{ color: 'var(--muted)' }}>
          {unit}
        </span>
      </p>
    </div>
  )
}
