'use client'

import { useState } from 'react'
import { login } from '@/actions/auth'
import Link from 'next/link'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setError(null)
    setLoading(true)
    const result = await login(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div
      className="rounded-2xl shadow-lg p-8"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <h2 className="text-xl font-semibold mb-6" style={{ color: 'var(--foreground)' }}>
        교사 로그인
      </h2>

      <form action={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium mb-1"
            style={{ color: 'var(--foreground)' }}
          >
            이메일
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="teacher@school.kr"
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all"
            style={{
              background: 'var(--background)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium mb-1"
            style={{ color: 'var(--foreground)' }}
          >
            비밀번호
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all"
            style={{
              background: 'var(--background)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--primary)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border)')}
          />
        </div>

        {error && (
          <div
            className="px-3 py-2.5 rounded-lg text-sm"
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: 'var(--danger)',
            }}
          >
            {error === 'Invalid login credentials'
              ? '이메일 또는 비밀번호가 올바르지 않습니다.'
              : error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60 mt-2"
          style={{ background: 'var(--primary)' }}
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>

      <p className="text-center text-sm mt-6" style={{ color: 'var(--muted)' }}>
        계정이 없으신가요?{' '}
        <Link
          href="/signup"
          className="font-medium"
          style={{ color: 'var(--primary)' }}
        >
          회원가입
        </Link>
      </p>
    </div>
  )
}
