import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Let the login page through — otherwise we'd redirect forever
  if (pathname.startsWith('/admin/login')) {
    return NextResponse.next()
  }

  const session = request.cookies.get('admin_session')?.value
  const secret = process.env.ADMIN_SECRET

  if (!secret || session !== secret) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  return NextResponse.next()
}

// Only run on /admin/* routes — all other routes skip this middleware entirely
export const config = {
  matcher: '/admin/:path*',
}
