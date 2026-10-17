import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/commerce-auth';
import { loadBusiness } from '@/lib/business/data';
import { businessRange, csvCell } from '@/lib/business/metrics';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
  if(!await requireOwner(request)) return NextResponse.json({error:'Unauthorized'},{status:401});
  const params=request.nextUrl.searchParams;
  const data=await loadBusiness(businessRange(params.get('from')??undefined,params.get('to')??undefined),params.get('mode')??undefined,request);
  if(params.get('format')!=='csv') return NextResponse.json({range:data.range,mode:data.mode,sandbox:data.sandbox,available:data.financialAvailable,summary:data.financialAvailable?data.summary:null,warnings:data.warnings},{headers:{'Cache-Control':'private, no-store'}});
  const rows:(string|number|null)[][]=[['PostDuty commerce summary'],['From (IST)',data.range.from],['Through (IST)',data.range.to],['Payment mode',data.mode],['Environment',data.sandbox?'Fictional preview':'Configured business environment'],['Currency','INR'],[],['Metric','Value','Definition'],['Verified gross receipts (INR)',data.financialAvailable?data.summary.revenue/100:'Insufficient data','Captured payments matched to orders; before refunds, taxes, fees and expenses'],['Verified paid orders',data.financialAvailable?data.summary.paidCount:'Insufficient data','Matching capture, mode, amount and currency'],['Previous period gross receipts (INR)',data.financialAvailable?data.summary.previousRevenue/100:'Insufficient data','Equal duration preceding selected range'],['Average order value (INR)',data.financialAvailable&&data.summary.averageOrderValue!==null?data.summary.averageOrderValue/100:'Insufficient data','Gross receipts divided by verified paid orders'],['Unverified paid-status records excluded',data.summary.unverifiedCount,'Unknown payment mode or capture evidence'],[],['Date (IST)','Verified orders','Gross receipts (INR)']];
  if(data.financialAvailable) rows.push(...data.summary.daily.map(d=>[d.day,d.orders,d.revenue/100]));
  if(data.warnings.length) rows.push([],['Source limitations'],...data.warnings.map(w=>[w]));
  return new NextResponse('\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="postduty-${data.mode}-${data.range.from}-${data.range.to}.csv"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
