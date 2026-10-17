import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Catalogue-only mode: ordering is closed, so the cart sends visitors back to the store.
  if (pathname === '/cart') {
    if (process.env.COMMERCE_CATALOG_ONLY === 'true') {
      return NextResponse.redirect(new URL('/store', request.url))
    }
    return NextResponse.next()
  }

  // The store hostname's root redirects to its catalog path. This keeps
  // commerce navigation static and leaves /admin authentication unchanged.
  if (pathname === '/') {
    const host = (request.headers.get('host') ?? '').split(':')[0].toLowerCase()
    if (host === 'store.postduty.in') {
      const storeUrl = request.nextUrl.clone()
      storeUrl.pathname = '/store'
      return NextResponse.redirect(storeUrl)
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
  matcher: ['/', '/cart', '/admin/:path*'],
}
