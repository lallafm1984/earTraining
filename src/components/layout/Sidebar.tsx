'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/actions/auth'
import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  FileMusic,
  LogOut,
  GraduationCap,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard',     label: '대시보드',  icon: LayoutDashboard },
  { href: '/questions',     label: '문제 은행', icon: BookOpen },
  { href: '/sessions',      label: '수업 세션', icon: CalendarDays },
  { href: '/score-creator', label: '악보 제작', icon: FileMusic },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="w-60 flex flex-col h-full"
      style={{
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* 로고 */}
      <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--primary)' }}
          >
            <GraduationCap size={20} color="white" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight" style={{ color: 'var(--foreground)' }}>
              청음 플랫폼
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              교사 관리 시스템
            </p>
          </div>
        </div>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors"
              style={{
                background: isActive ? '#EEF2FF' : 'transparent',
                color: isActive ? 'var(--primary)' : 'var(--muted)',
              }}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* 로그아웃 */}
      <div className="px-3 py-4" style={{ borderTop: '1px solid var(--border)' }}>
        <form action={logout}>
          <button
            type="submit"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium w-full transition-colors hover:bg-red-50"
            style={{ color: 'var(--muted)' }}
          >
            <LogOut size={18} />
            로그아웃
          </button>
        </form>
      </div>
    </aside>
  )
}
