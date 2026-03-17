export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-dvh overflow-hidden" style={{ background: 'var(--background)' }}>
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
