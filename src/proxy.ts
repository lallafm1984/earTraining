import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  // TODO: 테스트 모드 — 인증 검사 비활성화
  // 실서비스 전환 시 아래 주석을 해제하고 이 줄을 삭제하세요
  return NextResponse.next({ request })

  /* --- 운영 인증 코드 (비활성화 중) ---
  import { createServerClient } from '@supabase/ssr'

  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl
  const protectedPaths = ['/dashboard', '/questions', '/sessions']
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p))
  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }
  return supabaseResponse
  --- */
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
