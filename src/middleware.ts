import { NextRequest, NextResponse } from 'next/server';

async function ownerSession(request: NextRequest): Promise<boolean> {
 const secret=process.env.ADMIN_SECRET;
 if(secret && request.cookies.get('admin_session')?.value===secret) return true;
 const token=request.cookies.get('commerce_access_token')?.value;
 if(!token || token.length>8192 || !process.env.COMMERCE_OWNER_USER_ID || !process.env.COMMERCE_OWNER_GOOGLE_SUB) return false;
 try {
  const result=await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`,{headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??'',Authorization:`Bearer ${token}`},cache:'no-store'});
  if(!result.ok) return false;
  const user=await result.json() as {id:string;is_anonymous?:boolean;identities?:{provider:string;id:string}[]};
  return user.id===process.env.COMMERCE_OWNER_USER_ID && !user.is_anonymous && !!user.identities?.some(i=>i.provider==='google'&&i.id===process.env.COMMERCE_OWNER_GOOGLE_SUB);
 } catch { return false; }
}
export async function middleware(request:NextRequest) {
 const {pathname}=request.nextUrl;
 if(process.env.COMMERCE_CATALOG_ONLY==='true' && pathname==='/cart') return NextResponse.redirect(new URL('/store',request.url));
 // This switch is set only on the isolated commerce preview Worker.
 // The production Worker keeps its existing routing and authentication behaviour.
 const restrictedPreview=process.env.COMMERCE_SANDBOX==='true' && process.env.COMMERCE_PREVIEW_ACCESS==='owner';
 const signInPath=['/admin/login','/api/admin/login','/api/admin/google-session','/api/admin/logout'].includes(pathname);
 const publicAsset=pathname.startsWith('/_next/static/') || pathname==='/favicon.ico';
 if(restrictedPreview && !signInPath && !publicAsset && !await ownerSession(request)) {
  const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow, noarchive'};
  if(pathname.startsWith('/api/')) return NextResponse.json({error:'Sign in as the authorized owner to use this test preview.'},{status:401,headers});
  const url=new URL('/admin/login',request.url);
  url.searchParams.set('next',pathname+request.nextUrl.search);
  const response=NextResponse.redirect(url);
  Object.entries(headers).forEach(([key,value])=>response.headers.set(key,value));
  return response;
 }
 const host=(request.headers.get('host')??'').split(':')[0].toLowerCase();
 if(process.env.COMMERCE_SANDBOX!=='true') {
  const target=pathname==='/christmas' && host!=='christmas.postduty.in' ? 'christmas.postduty.in' : pathname==='/store' && host!=='store.postduty.in' ? 'store.postduty.in' : null;
  if(target && ['postduty.in','store.postduty.in','christmas.postduty.in'].includes(host)){const url=request.nextUrl.clone();url.hostname=target;return NextResponse.redirect(url);}
 }
 if(pathname==='/') {
  const target=host==='store.postduty.in'?'/store':host==='christmas.postduty.in'?'/christmas':null;
  if(target){const url=request.nextUrl.clone();url.pathname=target;return NextResponse.redirect(url);}
 }
 if(pathname.startsWith('/admin') && pathname!=='/admin/login' && !await ownerSession(request)) return NextResponse.redirect(new URL('/admin/login',request.url));
 const response=NextResponse.next();
 if(process.env.COMMERCE_SANDBOX==='true') response.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
 if(restrictedPreview||pathname.startsWith('/admin')||pathname.startsWith('/creator')||pathname.startsWith('/api/')) response.headers.set('Cache-Control','private, no-store');
 return response;
}
export const config={matcher:['/:path*']};
