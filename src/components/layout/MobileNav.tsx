'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, BookOpen, PlusCircle, Music2 } from 'lucide-react'

const navItems = [
  { href: '/dashboard',      label: '대시보드', icon: LayoutDashboard },
  { href: '/questions',      label: '문제 은행', icon: BookOpen },
  { href: '/questions/new',  label: '출제',      icon: PlusCircle },
  { href: '/sessions',       label: '세션',      icon: Music2 },
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
            className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors"
            style={{ color: isActive ? 'var(--primary)' : 'var(--muted)', minHeight: 56 }}
          >
            <Icon size={22} />
            <span className="text-xs font-medium" style={{ fontSize: 10 }}>{item.label}</span>
            {isActive && (
              <span
                className="absolute bottom-0 rounded-full"
                style={{
                  width: 4, height: 4,
                  background: 'var(--primary)',
                  marginBottom: 'calc(env(safe-area-inset-bottom) + 2px)',
                }}
              />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
