'use client'

import { usePathname, useRouter } from 'next/navigation'
import { GraduationCap, ChevronLeft, PlusCircle } from 'lucide-react'
import Link from 'next/link'

// 최상위 페이지 (뒤로가기 없음) / 서브 페이지 구분
const ROOT_PAGES = ['/dashboard', '/questions', '/sessions', '/score-creator']

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':     '청음 플랫폼',
  '/questions':     '문제 은행',
  '/questions/new': '새 문제 출제',
  '/sessions':      '수업 세션',
  '/score-creator': '악보 제작',
}

// 페이지별 우측 액션 버튼 설정
const PAGE_ACTIONS: Record<string, { href: string; label: string } | null> = {
  '/questions': { href: '/questions/new', label: '출제' },
  '/sessions':  { href: '/sessions/new',  label: '생성' },
}

function getTitle(pathname: string) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  const match = Object.keys(PAGE_TITLES)
    .filter((k) => k !== '/dashboard' && pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0]
  return match ? PAGE_TITLES[match] : '청음 플랫폼'
}

export default function MobileHeader() {
  const pathname = usePathname()
  const router = useRouter()

  const isRoot = ROOT_PAGES.includes(pathname)
  const action = PAGE_ACTIONS[pathname] ?? null
  const title = getTitle(pathname)

  return (
    <header
      className="flex md:hidden items-center gap-2 px-3 flex-shrink-0"
      style={{
        height: 'calc(env(safe-area-inset-top) + 56px)',
        paddingTop: 'env(safe-area-inset-top)',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* 왼쪽: 로고 or 뒤로가기 */}
      {isRoot ? (
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--primary)' }}
        >
          <GraduationCap size={18} color="white" />
        </div>
      ) : (
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
          style={{
            background: 'var(--background)',
            color: 'var(--foreground)',
            WebkitTapHighlightColor: 'transparent',
          }}
          aria-label="뒤로 가기"
        >
          <ChevronLeft size={20} />
        </button>
      )}

      {/* 가운데: 페이지 타이틀 */}
      <h1
        className="flex-1 text-base font-bold truncate"
        style={{ color: 'var(--foreground)' }}
      >
        {title}
      </h1>

      {/* 오른쪽: 페이지 액션 버튼 (있을 때만) */}
      {action && (
        <Link
          href={action.href}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white active:scale-95 transition-transform flex-shrink-0"
          style={{
            background: 'var(--primary)',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <PlusCircle size={13} />
          {action.label}
        </Link>
      )}
    </header>
  )
}
