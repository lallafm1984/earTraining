// TODO: 테스트 모드 — Supabase 연결 없이 mock 데이터로 동작
// 실서비스 전환 시 하단 주석 처리된 코드를 복원하세요
import { BookOpen, Music2, PlusCircle, TrendingUp, ChevronRight, FileMusic, CalendarDays } from 'lucide-react'
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

  const isFirstTime = questionCount === 0 && sessionCount === 0

  return (
    <div className="p-4 md:p-8">
      {/* PC 헤더 */}
      <div className="mb-6 hidden md:block">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
          안녕하세요, {profile?.name ?? '선생님'} 👋
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          오늘도 좋은 수업 되세요.
        </p>
      </div>

      {/* 모바일 인사 배너 */}
      <div
        className="md:hidden rounded-2xl p-4 mb-5 flex items-center gap-3"
        style={{
          background: 'linear-gradient(135deg, var(--primary) 0%, #5b7fd4 100%)',
          color: 'white',
        }}
      >
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.2)' }}
        >
          <span style={{ fontSize: 22 }}>👋</span>
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm truncate">
            {profile?.name ?? '선생님'}, 안녕하세요!
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.8)' }}>
            오늘도 좋은 수업 되세요.
          </p>
        </div>
      </div>

      {/* 통계 카드 — 모바일: 가로 스크롤 슬라이더 */}
      <div className="mb-6">
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          <StatCard
            icon={<BookOpen size={18} />}
            label="전체 문제"
            value={questionCount ?? 0}
            unit="개"
            color="var(--primary)"
          />
          <StatCard
            icon={<TrendingUp size={18} />}
            label="문제 세트"
            value={setCount ?? 0}
            unit="개"
            color="#8b5cf6"
          />
          <StatCard
            icon={<Music2 size={18} />}
            label="수업 세션"
            value={sessionCount ?? 0}
            unit="개"
            color="var(--accent)"
          />
        </div>
      </div>

      {/* 처음 사용자 가이드 (문제/세션이 없을 때) */}
      {isFirstTime && (
        <div
          className="md:hidden rounded-2xl p-4 mb-6"
          style={{ background: '#EEF2FF', border: '1px solid #c7d2fe' }}
        >
          <p className="text-sm font-bold mb-3" style={{ color: 'var(--primary)' }}>
            처음 시작하기 가이드
          </p>
          <div className="flex flex-col gap-2">
            {[
              { step: '1', text: '문제 은행에서 청음 문제를 출제하세요', href: '/questions/new' },
              { step: '2', text: '악보 제작으로 시험지를 만들어 보세요', href: '/score-creator' },
              { step: '3', text: '수업 세션을 열어 학생들과 공유하세요', href: '/sessions' },
            ].map((item) => (
              <Link
                key={item.step}
                href={item.href}
                className="flex items-center gap-3 p-2.5 rounded-xl active:scale-98 transition-transform"
                style={{ background: 'white', WebkitTapHighlightColor: 'transparent' }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white"
                  style={{ background: 'var(--primary)' }}
                >
                  {item.step}
                </div>
                <span className="flex-1 text-xs font-medium" style={{ color: 'var(--foreground)' }}>
                  {item.text}
                </span>
                <ChevronRight size={14} style={{ color: 'var(--muted)' }} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 빠른 액션 */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--muted)' }}>
          빠른 메뉴
        </h2>

        {/* 모바일: 2x2 그리드 카드 */}
        <div className="grid grid-cols-2 gap-3 md:hidden">
          {[
            { href: '/questions/new', icon: PlusCircle,  label: '새 문제 출제', desc: '청음 문제 만들기',   color: 'var(--primary)',  textColor: 'white' },
            { href: '/questions',     icon: BookOpen,     label: '문제 은행',    desc: '문제 목록 확인',   color: 'var(--surface)',  textColor: 'var(--foreground)' },
            { href: '/sessions',      icon: CalendarDays, label: '세션 관리',    desc: '수업 세션 운영',   color: 'var(--surface)',  textColor: 'var(--foreground)' },
            { href: '/score-creator', icon: FileMusic,    label: '악보 제작',    desc: '시험지 제작',      color: 'var(--surface)',  textColor: 'var(--foreground)' },
          ].map((item) => {
            const Icon = item.icon
            const isPrimary = item.color === 'var(--primary)'
            return (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-2xl p-4 flex flex-col gap-2 active:scale-95 transition-transform"
                style={{
                  background: item.color,
                  border: isPrimary ? 'none' : '1px solid var(--border)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{
                    background: isPrimary ? 'rgba(255,255,255,0.2)' : 'var(--primary)18',
                    color: isPrimary ? 'white' : 'var(--primary)',
                  }}
                >
                  <Icon size={18} />
                </div>
                <div>
                  <p
                    className="text-sm font-bold"
                    style={{ color: isPrimary ? 'white' : 'var(--foreground)' }}
                  >
                    {item.label}
                  </p>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: isPrimary ? 'rgba(255,255,255,0.75)' : 'var(--muted)' }}
                  >
                    {item.desc}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>

        {/* PC: 기존 가로형 버튼 */}
        <div className="hidden md:flex flex-wrap gap-3">
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
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
          >
            <BookOpen size={16} />
            문제 은행 보기
          </Link>
          <Link
            href="/sessions"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
          >
            <Music2 size={16} />
            세션 관리
          </Link>
        </div>
      </div>

      {/* 최근 문제 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>
            최근 출제 문제
          </h2>
          <Link
            href="/questions"
            className="flex items-center gap-0.5 text-xs font-medium"
            style={{ color: 'var(--primary)' }}
          >
            전체 보기
            <ChevronRight size={13} />
          </Link>
        </div>

        {recentQuestions && recentQuestions.length > 0 ? (
          <>
            {/* 모바일: 카드형 목록 */}
            <div className="flex flex-col gap-2 md:hidden">
              {recentQuestions.map((q) => (
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
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--primary)18', color: 'var(--primary)' }}
                  >
                    <BookOpen size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--foreground)' }}>
                      {q.title}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                      {typeLabels[q.type] ?? q.type} · {new Date(q.created_at).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                      style={{ background: levelColors[q.level] }}
                    >
                      {levelLabels[q.level] ?? q.level}
                    </span>
                    <ChevronRight size={14} style={{ color: 'var(--muted)' }} />
                  </div>
                </Link>
              ))}
            </div>

            {/* PC: 테이블형 */}
            <div
              className="hidden md:block rounded-2xl overflow-hidden"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th className="text-left px-5 py-3 text-xs font-semibold" style={{ color: 'var(--muted)' }}>문제 제목</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold" style={{ color: 'var(--muted)' }}>유형</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold" style={{ color: 'var(--muted)' }}>난이도</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold" style={{ color: 'var(--muted)' }}>출제일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentQuestions.map((q, i) => (
                      <tr
                        key={q.id}
                        style={{ borderBottom: i < recentQuestions.length - 1 ? '1px solid var(--border)' : 'none' }}
                      >
                        <td className="px-5 py-3.5 text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                          <Link href={`/questions/${q.id}`} className="hover:underline">{q.title}</Link>
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
            </div>
          </>
        ) : (
          /* 빈 상태 */
          <div
            className="rounded-2xl py-10 px-4 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <BookOpen size={36} className="mx-auto mb-3" style={{ color: 'var(--border)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
              아직 출제된 문제가 없습니다.
            </p>
            <Link
              href="/questions/new"
              className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-xl text-sm font-semibold text-white active:scale-95 transition-transform"
              style={{ background: 'var(--primary)', WebkitTapHighlightColor: 'transparent' }}
            >
              <PlusCircle size={14} />
              첫 문제 출제하기
            </Link>
          </div>
        )}
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
      className="rounded-2xl p-3 md:p-5"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-2 md:mb-4">
        <span className="text-xs md:text-sm font-medium" style={{ color: 'var(--muted)' }}>
          {label}
        </span>
        <div
          className="w-7 h-7 md:w-9 md:h-9 rounded-xl flex items-center justify-center"
          style={{ background: color + '18', color }}
        >
          {icon}
        </div>
      </div>
      <p className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--foreground)' }}>
        {value}
        <span className="text-xs md:text-base font-medium ml-0.5 md:ml-1" style={{ color: 'var(--muted)' }}>
          {unit}
        </span>
      </p>
    </div>
  )
}
