import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // On the dedicated shop hostname, show the existing catalog at /.
  // Do not change any /admin authentication or authorization behavior.
  if (pathname === '/') {
    const host = (request.headers.get('host') ?? '').split(':')[0].toLowerCase()
    if (host === 'store.postduty.in') {
      const storeUrl = request.nextUrl.clone()
      storeUrl.pathname = '/store'
      return NextResponse.rewrite(storeUrl)
    }
    return NextResponse.next()
  }

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

// Include the root for the shop hostname; preserve the existing admin gate.
export const config = {
  matcher: ['/', '/admin/:path*'],
}
