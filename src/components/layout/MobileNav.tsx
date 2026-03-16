'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, BookOpen, CalendarDays, FileMusic } from 'lucide-react'

const navItems = [
  { href: '/dashboard',     label: '홈',       icon: LayoutDashboard },
  { href: '/questions',     label: '문제 은행', icon: BookOpen },
  { href: '/sessions',      label: '세션',      icon: CalendarDays },
  { href: '/score-creator', label: '악보 제작', icon: FileMusic },
]

export default function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden"
      style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 -2px 12px rgba(0,0,0,0.06)',
      }}
    >
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
            className="flex-1 flex flex-col items-center justify-center gap-1 transition-all active:scale-95"
            style={{
              color: isActive ? 'var(--primary)' : 'var(--muted)',
              minHeight: 60,
              paddingTop: 10,
              paddingBottom: 6,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {/* 활성 탭 배경 필 */}
            <div
              className="flex items-center justify-center rounded-2xl transition-all"
              style={{
                width: 44,
                height: 28,
                background: isActive ? 'var(--primary)18' : 'transparent',
              }}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
            </div>
            <span
              className="font-medium transition-all"
              style={{
                fontSize: 10,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--primary)' : 'var(--muted)',
              }}
            >
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
