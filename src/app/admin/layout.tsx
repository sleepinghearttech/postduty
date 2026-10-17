'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './commerce-admin.css';
const links=[['/admin','Overview','◫'],['/admin/products','Products','◇'],['/admin/orders','Orders','▤'],['/admin/creators','Creators','♧'],['/admin/analytics','Insights','↗']] as const;
export default function AdminLayout({children}:{children:React.ReactNode}) {
 const path=usePathname(); if(path==='/admin/login') return <>{children}</>;
 return <div className="commerce-admin"><header className="commerce-top"><Link href="/admin" className="commerce-brand">PostDuty <span>studio</span></Link><div><Link href="/christmas">View stores ↗</Link><form action="/api/admin/logout" method="post"><button>Sign out</button></form></div></header><div className="commerce-subnav"><Link href="/admin/research">Research notebook</Link><Link href="/admin/christmas">Christmas Lab</Link><Link href="/admin/coupons">Promotions</Link><Link href="https://command.postduty.in">Command Centre ↗</Link></div>{children}<nav className="commerce-bottom" aria-label="Business navigation">{links.map(([href,label,icon])=><Link key={href} href={href} aria-current={(href==='/admin'?path===href:path.startsWith(href))?'page':undefined}><span aria-hidden>{icon}</span>{label}</Link>)}</nav></div>;
}
