'use client'

import { useState } from 'react'
import { signup } from '@/actions/auth'
import Link from 'next/link'

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setError(null)

    const password = formData.get('password') as string
    const passwordConfirm = formData.get('passwordConfirm') as string

    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.')
      return
    }

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.')
      return
    }

    setLoading(true)
    const result = await signup(formData)
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
        교사 계정 만들기
      </h2>

      <form action={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium mb-1"
            style={{ color: 'var(--foreground)' }}
          >
            이름
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="홍길동"
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
            autoComplete="new-password"
            placeholder="6자 이상"
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
            htmlFor="passwordConfirm"
            className="block text-sm font-medium mb-1"
            style={{ color: 'var(--foreground)' }}
          >
            비밀번호 확인
          </label>
          <input
            id="passwordConfirm"
            name="passwordConfirm"
            type="password"
            required
            autoComplete="new-password"
            placeholder="비밀번호 재입력"
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
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60 mt-2"
          style={{ background: 'var(--primary)' }}
        >
          {loading ? '가입 중...' : '회원가입'}
        </button>
      </form>

      <p className="text-center text-sm mt-6" style={{ color: 'var(--muted)' }}>
        이미 계정이 있으신가요?{' '}
        <Link
          href="/login"
          className="font-medium"
          style={{ color: 'var(--primary)' }}
        >
          로그인
        </Link>
      </p>
    </div>
  )
}
