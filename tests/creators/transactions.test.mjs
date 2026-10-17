import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {PGlite}=await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const db=new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
await db.exec(await readFile(new URL('../../supabase/migrations/20261016090236_commerce_preview_schema.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../../docs/commerce/creator-functions.sql',import.meta.url),'utf8'));
let seq=0;
async function invitation({expires='2099-01-01'}={}){
 const n=++seq;const id=`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const user=`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;const token=String(n).padStart(64,'a');const email=`fixture${n}@example.invalid`;
 await db.query(`INSERT INTO preview_creators(id,email,display_name) VALUES($1,$2,'Fictional Creator')`,[id,email]);
 await db.query(`INSERT INTO preview_creator_invites(creator_id,email,token_hash,expires_at) VALUES($1,$2,$3,$4)`,[id,email,token,expires]);
 return{id,user,token,email};
}
const redeem=(fixture,overrides={})=>db.query('SELECT preview_redeem_creator_invitation($1,$2,$3) AS id',[overrides.token??fixture.token,overrides.user??fixture.user,overrides.email??fixture.email]);

test('invitation binds to email and membership; wrong email and expired links cannot grant access',async()=>{
 const f=await invitation();await assert.rejects(redeem(f,{email:'other@example.invalid'}),/Invalid invitation/);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM preview_commerce_memberships WHERE user_id=$1',[f.user])).rows[0].n,0);
 assert.equal((await db.query('SELECT status FROM preview_creators WHERE id=$1',[f.id])).rows[0].status,'invited');
 const expired=await invitation({expires:'2000-01-01'});await assert.rejects(redeem(expired),/Invalid invitation/);
});
test('successful redemption is one-time and grants creator only, even under a repeated request',async()=>{
 const f=await invitation();assert.equal((await redeem(f)).rows[0].id,f.id);
 const member=(await db.query('SELECT * FROM preview_commerce_memberships WHERE user_id=$1',[f.user])).rows[0];
 assert.equal(member.role,'creator');assert.equal(member.creator_id,f.id);assert.equal(member.status,'active');
 await assert.rejects(redeem(f),/Invalid invitation/);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM preview_audit_events WHERE entity_id=$1',[f.id])).rows[0].n,1);
});
test('an existing owner membership cannot be overwritten; invitation and creator update roll back',async()=>{
 const f=await invitation();await db.query(`INSERT INTO preview_commerce_memberships(user_id,role) VALUES($1,'owner')`,[f.user]);
 await assert.rejects(redeem(f),/duplicate key/);
 assert.equal((await db.query('SELECT role FROM preview_commerce_memberships WHERE user_id=$1',[f.user])).rows[0].role,'owner');
 assert.equal((await db.query('SELECT user_id FROM preview_creators WHERE id=$1',[f.id])).rows[0].user_id,null);
 assert.equal((await db.query('SELECT accepted_at FROM preview_creator_invites WHERE creator_id=$1',[f.id])).rows[0].accepted_at,null);
});
test('anon and authenticated roles cannot call privileged invitation or review RPCs or read creator/customer rows',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec(`SET ROLE ${role}`);
  await assert.rejects(db.query(`SELECT preview_redeem_creator_invitation($1,$2,$3)`,['a'.repeat(64),'20000000-0000-4000-8000-000000000001','fixture@example.invalid']),/permission denied/);
  await assert.rejects(db.query('SELECT * FROM preview_creators'),/permission denied/);
  await assert.rejects(db.query('SELECT * FROM preview_orders'),/permission denied/);
  await db.exec('RESET ROLE');
 }
});
async function submission(){
 const f=await invitation();const id=`30000000-0000-4000-8000-${String(seq).padStart(12,'0')}`;
 await db.query(`INSERT INTO preview_creator_submissions(id,creator_id,title,proposed_price,details) VALUES($1,$2,'Fictional crochet ornament',25000,$3)`,[id,f.id,{description:'Test only',stock:3,storefronts:['general','christmas'],media:[{type:'image',url:'https://example.invalid/fixture.jpg',alt:'Fictional item'}],license_status:'owned',preparation_days:4}]);
 return{...f,submission:id};
}
const review=(f,status='approved',price=30000)=>db.query('SELECT preview_review_creator_submission($1,$2,$3,$4) AS result',[f.submission,status,price,'Fictional review']);
test('owner approval atomically creates an unpublished canonical draft with owner price and unverified rights',async()=>{
 const f=await submission();const result=(await review(f)).rows[0].result;
 assert.equal(result.product_id,f.submission);
 const product=(await db.query('SELECT * FROM preview_products WHERE id=$1',[f.submission])).rows[0];
 assert.equal(product.is_active,false);assert.equal(product.creator_id,f.id);assert.equal(product.price,30000);
 const ops=(await db.query('SELECT details FROM preview_product_operations WHERE product_id=$1',[f.submission])).rows[0].details;
 assert.equal(ops.license_status,'unverified');assert.equal(ops.proposed_price_rupees,250);
 await assert.rejects(review(f),/already reviewed/);
});
test('concurrent approve/reject resolves once without a detached product or changed public listing',async()=>{
 const f=await submission();const results=await Promise.allSettled([review(f),review(f,'rejected',null)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const row=(await db.query('SELECT status FROM preview_creator_submissions WHERE id=$1',[f.submission])).rows[0];
 const count=(await db.query('SELECT count(*)::int AS n FROM preview_products WHERE id=$1',[f.submission])).rows[0].n;
 assert.equal(count,row.status==='approved'?1:0);
});
test('invalid price and draft insert failure leave submission pending with no product or operations',async()=>{
 const f=await submission();await assert.rejects(review(f,'approved',0),/Invalid approved price/);
 await db.exec(`CREATE FUNCTION reject_fixture_product() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture_failure'; END $$; CREATE TRIGGER fixture_reject BEFORE INSERT ON preview_products FOR EACH ROW EXECUTE FUNCTION reject_fixture_product();`);
 await assert.rejects(review(f),/fixture_failure/);
 await db.exec('DROP TRIGGER fixture_reject ON preview_products; DROP FUNCTION reject_fixture_product();');
 assert.equal((await db.query('SELECT status FROM preview_creator_submissions WHERE id=$1',[f.submission])).rows[0].status,'submitted');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM preview_products WHERE id=$1',[f.submission])).rows[0].n,0);
});

test('review rejects existing-product edits instead of duplicating canonical inventory',async()=>{
 const original=await submission();await review(original);
 const edit=await submission();await db.query('UPDATE preview_creator_submissions SET product_id=$1 WHERE id=$2',[original.submission,edit.submission]);
 await assert.rejects(review(edit),/Existing product edits require owner product editor/);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM preview_products WHERE id=$1',[edit.submission])).rows[0].n,0);
 assert.equal((await db.query('SELECT status FROM preview_creator_submissions WHERE id=$1',[edit.submission])).rows[0].status,'submitted');
});
