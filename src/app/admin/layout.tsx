'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

function NavLink({
  href,
  current,
  children,
}: {
  href: string
  current: string
  children: React.ReactNode
}) {
  const active = current.startsWith(href)
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
        active
          ? 'text-brand bg-brand-light'
          : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
      }`}
    >
      {children}
    </Link>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/admin/login') return <>{children}</>

  return (
    <>
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-11 flex items-center gap-1">
          <span className="font-bold text-brand text-sm mr-4">PostDuty Admin</span>
          <NavLink href="/admin/products" current={pathname}>Products</NavLink>
          <NavLink href="/admin/orders" current={pathname}>Orders</NavLink>
        </div>
      </nav>
      {children}
    </>
  )
}
