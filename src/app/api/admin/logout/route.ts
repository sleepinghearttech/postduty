import { NextRequest, NextResponse } from 'next/server';
import { isAllowedMutationOrigin } from '@/lib/commerce-auth';
export async function POST(request:NextRequest) {
 if(!isAllowedMutationOrigin(request)) return NextResponse.json({error:'Invalid origin'},{status:403});
 const response=NextResponse.redirect(new URL('/admin/login?signed_out=1',request.url),303);
 response.cookies.delete('admin_session'); response.cookies.delete('commerce_access_token'); return response;
}
