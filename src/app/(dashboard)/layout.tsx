// TODO: 테스트 모드 — 인증 검사 비활성화
import Sidebar from '@/components/layout/Sidebar'
import MobileHeader from '@/components/layout/MobileHeader'
import MobileNav from '@/components/layout/MobileNav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-dvh overflow-hidden" style={{ background: 'var(--background)' }}>
      {/* PC: 좌측 사이드바 */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* 콘텐츠 영역 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 모바일: 상단 헤더 */}
        <MobileHeader />

        {/* 메인 스크롤 영역 — 모바일 하단 탭바 높이만큼 패딩 */}
        <main
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 64px)' }}
        >
          {/* PC에서는 하단 패딩 제거 */}
          <style>{`@media (min-width: 768px) { main { padding-bottom: 0 !important; } }`}</style>
          {children}
        </main>
      </div>

      {/* 모바일: 하단 탭 네비게이션 */}
      <MobileNav />
    </div>
  )
}
