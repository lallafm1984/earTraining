'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { Search } from 'lucide-react'

const types = [
  { value: '', label: '전체 유형' },
  { value: 'TYPE-01', label: '단음 식별' },
  { value: 'TYPE-02', label: '음정 식별' },
  { value: 'TYPE-03', label: '화음 식별' },
  { value: 'TYPE-04', label: '리듬 받아쓰기' },
  { value: 'TYPE-05', label: '선율 받아쓰기' },
  { value: 'TYPE-06', label: '조성 식별' },
]

const levels = [
  { value: '', label: '전체 난이도' },
  { value: 'beginner', label: '초급' },
  { value: 'intermediate', label: '중급' },
  { value: 'advanced', label: '고급' },
]

export default function QuestionFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`/questions?${params.toString()}`)
    },
    [router, searchParams]
  )

  return (
    <div className="flex flex-wrap gap-3">
      {/* 검색 */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl flex-1 min-w-48"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <Search size={15} style={{ color: 'var(--muted)' }} />
        <input
          type="text"
          placeholder="문제 제목 검색..."
          defaultValue={searchParams.get('q') ?? ''}
          onChange={(e) => {
            const val = e.target.value
            clearTimeout((window as unknown as { _searchTimer: ReturnType<typeof setTimeout> })._searchTimer)
            ;(window as unknown as { _searchTimer: ReturnType<typeof setTimeout> })._searchTimer = setTimeout(() => updateFilter('q', val), 400)
          }}
          className="flex-1 text-sm outline-none bg-transparent"
          style={{ color: 'var(--foreground)' }}
        />
      </div>

      {/* 유형 필터 */}
      <select
        value={searchParams.get('type') ?? ''}
        onChange={(e) => updateFilter('type', e.target.value)}
        className="px-3 py-2 rounded-xl text-sm outline-none cursor-pointer"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--foreground)',
        }}
      >
        {types.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      {/* 난이도 필터 */}
      <select
        value={searchParams.get('level') ?? ''}
        onChange={(e) => updateFilter('level', e.target.value)}
        className="px-3 py-2 rounded-xl text-sm outline-none cursor-pointer"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--foreground)',
        }}
      >
        {levels.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
    </div>
  )
}
