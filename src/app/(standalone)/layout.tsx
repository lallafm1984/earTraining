export default function StandaloneLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-dvh overflow-hidden" style={{ background: 'var(--background)' }}>
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}
