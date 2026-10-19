import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { madeByLine, creatorStory, STOREFRONT_CREATOR_COLUMNS, PUBLIC_CREATOR_COLUMNS } from '../src/lib/creator-profile.ts';
// Runs the PREPARED creator-credit migration against disposable local Postgres (PGlite); never contacts any real database.
const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const production = await read('../supabase/commerce/creator-credit.production.sql');
const preview = await read('../supabase/commerce/creator-credit.preview.sql');

test('storefront credit reads exactly "Made by <display_name>"; story only when non-empty; profession never read', async () => {
  assert.equal(madeByLine({ display_name: ' Fictional Maker ' }), 'Made by Fictional Maker');
  assert.equal(madeByLine({ display_name: 'Fictional Maker', profession: 'Staff nurse' }), 'Made by Fictional Maker');
  assert.equal(creatorStory({ bio: '  ' }), null); assert.equal(creatorStory({ bio: null }), null); assert.equal(creatorStory({ bio: ' Night-shift maker. ' }), 'Night-shift maker.');
  assert.equal(STOREFRONT_CREATOR_COLUMNS, 'id,display_name,bio,photo_url');
  assert.equal(PUBLIC_CREATOR_COLUMNS, 'id,display_name,bio,photo_url,profession'); // database grant list unchanged
  const page = await read('../src/app/products/[slug]/page.tsx');
  assert.match(page, /\{madeByLine\(creator\)\}/); assert.match(page, /creatorStory\(creator\)&&/); assert.doesNotMatch(page, /profession/);
  const catalog = await read('../src/components/commerce/catalog-data.ts');
  assert.match(catalog, /select\(STOREFRONT_CREATOR_COLUMNS\)/); assert.doesNotMatch(catalog, /profession/);
});

test('public policy: published invited and active creators are visible; suspended and unpublished never', async () => {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for (const path of ['../supabase/migrations/20261016090236_commerce_preview_schema.sql', '../supabase/commerce/payment-supplement.preview.sql', '../supabase/commerce/checkout-phase-a.preview.sql', '../supabase/commerce/checkout-phase-b.preview.sql']) await db.exec(await read(path));
  await db.exec(preview); await db.exec(preview); // re-runnable
  await db.query(`INSERT INTO preview_creators(id,email,display_name,status,profile_published) VALUES
    ('40000000-0000-4000-8000-000000000001','i@example.invalid','Invited Maker','invited',true),
    ('40000000-0000-4000-8000-000000000002','a@example.invalid','Active Maker','active',true),
    ('40000000-0000-4000-8000-000000000003','s@example.invalid','Suspended Maker','suspended',true),
    ('40000000-0000-4000-8000-000000000004','u@example.invalid','Unpublished Maker','active',false)`);
  assert.deepEqual((await db.query("SELECT polname FROM pg_policy WHERE polrelid='preview_creators'::regclass")).rows.map(r => r.polname), ['creators_public_profile']);
  await db.exec('SET ROLE anon');
  try {
    const rows = (await db.query('SELECT id,display_name,bio,photo_url FROM preview_creators ORDER BY display_name')).rows;
    assert.deepEqual(rows.map(r => r.display_name), ['Active Maker', 'Invited Maker']);
    await assert.rejects(db.query('SELECT email FROM preview_creators'), /permission denied/); // column grants unchanged
  } finally { await db.exec('RESET ROLE'); await db.close(); }
});

test('production and preview files are identical apart from the preview_ prefix', () => {
  const code = s => s.replace(/\r/g, '').split('\n').filter(line => !line.startsWith('--')).join('\n');
  assert.equal(code(preview).replace(/preview_/g, ''), code(production));
  assert.doesNotMatch(code(production), /preview_/);
  assert.match(production, /PRODUCTION ONLY/); assert.match(preview, /PREVIEW ONLY/);
  assert.equal((code(production).match(/^BEGIN;$/gm) ?? []).length, 1);
  assert.match(code(production), /USING \(status IN \('invited','active'\) AND profile_published\)/);
  assert.doesNotMatch(code(production), /redeem_creator_invitation|GRANT|REVOKE/);
});

test('product editor lets the owner assign any non-suspended creator, including one who has not accepted yet', async () => {
  const editor = await read('../src/app/admin/products/ProductsClient.tsx');
  assert.match(editor, /<option key=\{c\.id\} value=\{c\.id\} disabled=\{c\.status === 'suspended'\}>/);
  assert.match(editor, /creator_id: fields\.creator_id\.trim\(\) \|\| null/);
});
