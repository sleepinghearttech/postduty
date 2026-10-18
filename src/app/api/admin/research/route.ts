import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { commerceTable } from '@/lib/commerce-db';
import { isAllowedMutationOrigin, requireOwner } from '@/lib/commerce-auth';
import { indiaDay } from '@/lib/business/metrics';
export const dynamic='force-dynamic';
const fields='id,title,finding,source_url,researched_at,confidence,expected_benefit,effort,risks,next_action,product_id,status,evidence_type,created_at';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function authorize(request:NextRequest,mutation=false) {
  if(!await requireOwner(request)) return NextResponse.json({error:'Unauthorized'},{status:401});
  if(mutation&&!isAllowedMutationOrigin(request)) return NextResponse.json({error:'Request origin not allowed'},{status:403});
  return null;
}
function validated(value:unknown) {
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('A research entry is required.');
  const body=value as Record<string,unknown>;
  const output:Record<string,string|null>={};
  for(const [field,max] of Object.entries({title:160,finding:4000,source_url:2000,expected_benefit:1000,effort:1000,risks:1000,next_action:2000})) {
    if(typeof body[field]!=='string'||String(body[field]).length>max) throw new Error(`Check ${field.replaceAll('_',' ')} (maximum ${max} characters).`);
    output[field]=String(body[field]).trim();
  }
  if(!output.title||!output.finding||!output.source_url||!output.next_action) throw new Error('Title, finding, source and next action are required.');
  let url:URL; try {url=new URL(output.source_url);} catch {throw new Error('Use a complete https:// source URL.');}
  if(url.protocol!=='https:'||url.username||url.password) throw new Error('Use a public HTTPS source URL without credentials.');
  output.source_url=url.href;
  for(const [field,allowed] of Object.entries({status:['proposed','accepted','rejected','testing','completed'],confidence:['low','medium','high'],evidence_type:['fact','estimate','hypothesis']})) {
    if(typeof body[field]!=='string'||!allowed.includes(String(body[field]))) throw new Error(`Choose a valid ${field.replaceAll('_',' ')}.`);
    output[field]=String(body[field]);
  }
  if(typeof body.researched_at!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(body.researched_at)||!Number.isFinite(Date.parse(body.researched_at))||new Date(body.researched_at).toISOString().slice(0,10)!==body.researched_at||body.researched_at>indiaDay()) throw new Error('Enter the date you actually reviewed the source, using YYYY-MM-DD. Future dates are not accepted.');
  output.researched_at=new Date(body.researched_at).toISOString();
  if(body.product_id!==null&&body.product_id!==''&&(typeof body.product_id!=='string'||!uuid.test(body.product_id))) throw new Error('Choose a valid product.');
  output.product_id=body.product_id?String(body.product_id):null;
  return output;
}
async function bodyOf(request:NextRequest):Promise<Record<string,unknown>> {
  const text=await request.text(); if(text.length>20000) throw new Error('Research entry is too large.');
  const body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body)) throw new Error('Invalid research entry.');return body;
}
async function audit(action:string,id:string) {await supabaseAdmin.from(commerceTable('audit_events')).insert({actor:'owner',action,entity_type:'research_insight',entity_id:id,details:{}});}
export async function GET(request:NextRequest) {
  const denied=await authorize(request);if(denied)return denied;
  const {data,error}=await supabaseAdmin.from(commerceTable('research_insights')).select(fields).order('researched_at',{ascending:false}).limit(1000);
  if(error)return NextResponse.json({error:'Research storage is not available in this environment.'},{status:503});
  return NextResponse.json({insights:data},{headers:{'Cache-Control':'private, no-store'}});
}
export async function POST(request:NextRequest) {
  const denied=await authorize(request,true);if(denied)return denied;
  try {
    const body=validated(await bodyOf(request));
    const {data,error}=await supabaseAdmin.from(commerceTable('research_insights')).insert(body).select(fields).single();
    if(error)return NextResponse.json({error:'Could not save research. Check that the selected product exists and storage is configured.'},{status:503});
    await audit('research.created',data.id);return NextResponse.json({insight:data},{status:201});
  } catch(error) {return NextResponse.json({error:error instanceof SyntaxError?'Invalid request.':error instanceof Error?error.message:'Invalid research entry.'},{status:400});}
}
export async function PATCH(request:NextRequest) {
  const denied=await authorize(request,true);if(denied)return denied;
  try {
    const body=await bodyOf(request);if(typeof body.id!=='string'||!uuid.test(body.id))throw new Error('Invalid research record.');
    const {data,error}=await supabaseAdmin.from(commerceTable('research_insights')).update(validated(body)).eq('id',body.id).select(fields).maybeSingle();
    if(error)return NextResponse.json({error:'Could not update research.'},{status:503});
    if(!data)return NextResponse.json({error:'Research entry not found.'},{status:404});
    await audit('research.updated',data.id);return NextResponse.json({insight:data});
  } catch(error) {return NextResponse.json({error:error instanceof SyntaxError?'Invalid request.':error instanceof Error?error.message:'Invalid research entry.'},{status:400});}
}
export async function DELETE(request:NextRequest) {
  const denied=await authorize(request,true);if(denied)return denied;
  try {
    const body=await bodyOf(request);if(typeof body.id!=='string'||!uuid.test(body.id))throw new Error('Invalid research record.');
    const {data,error}=await supabaseAdmin.from(commerceTable('research_insights')).delete().eq('id',body.id).select('id').maybeSingle();
    if(error)return NextResponse.json({error:'Could not remove research.'},{status:503});
    if(!data)return NextResponse.json({error:'Research entry not found.'},{status:404});
    await audit('research.deleted',data.id);return NextResponse.json({deleted:true});
  } catch {return NextResponse.json({error:'Invalid research request.'},{status:400});}
}
