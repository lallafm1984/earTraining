'use client'

import { usePathname } from 'next/navigation'
import { GraduationCap } from 'lucide-react'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':     '대시보드',
  '/questions':     '문제 은행',
  '/questions/new': '새 문제 출제',
  '/sessions':      '수업 세션',
}

function getTitle(pathname: string) {
  // 정확히 일치하는 경로 우선
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  // prefix 매칭
  const match = Object.keys(PAGE_TITLES)
    .filter((k) => k !== '/dashboard' && pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0]
  return match ? PAGE_TITLES[match] : '청음 플랫폼'
}

export default function MobileHeader() {
  const pathname = usePathname()

  return (
    <header
      className="flex md:hidden items-center gap-3 px-4 h-14 flex-shrink-0"
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--primary)' }}
      >
        <GraduationCap size={16} color="white" />
      </div>
      <h1 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
        {getTitle(pathname)}
      </h1>
    </header>
  )
}
