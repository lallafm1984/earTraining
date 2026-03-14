export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
      <div className="w-full max-w-md px-4">
        {/* 로고 영역 */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'var(--primary)' }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 4C16 4 8 10 8 18C8 22.4 11.6 26 16 26C20.4 26 24 22.4 24 18C24 10 16 4 16 4Z" fill="white" opacity="0.9"/>
              <circle cx="16" cy="18" r="4" fill="white"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
            청음 플랫폼
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            예술고등학교 청음 교육 웹 플랫폼
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}
