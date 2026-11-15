const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { publicKey, revision, mutation } = require('../app/src/main/assets/cloud-snapshot.js');

const root = path.resolve(__dirname, '..');
const first = '00000000-0000-0000-0000-000000000001';
const second = '00000000-0000-0000-0000-000000000002';

test('only public Supabase keys and compare-and-swap writes', () => {
  const jwt = role => 'e30.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.signature';
  assert.equal(publicKey(jwt('anon')), true);
  assert.equal(publicKey(jwt('service_role')), false);
  assert.equal(publicKey('sb_secret_abcd1234567890abcdef'), false);
  assert.equal(publicKey('sb_publishable_abcd1234567890abcdef'), true);
  assert.throws(() => revision({ updated_at: 'legacy' }));
  assert.equal(mutation(first, null, {}).method, 'POST');
  assert.match(mutation(first, null, {}).prefer, /ignore-duplicates/);
  assert.match(mutation(first, { revision: 4 }, {}).path, /revision=eq\.4/);
});

test('PostgreSQL migration preserves old rows, RLS isolates owners and stale writes are rejected', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      insert into auth.users values ('${first}'), ('${second}');
    `);
    await db.exec(await fs.readFile(path.join(root, 'supabase-schema.sql'), 'utf8'));
    await db.query("insert into public.forge_snapshots(user_id,payload) values($1, '{\"legacy\":true}')", [first]);
    const migration = await fs.readFile(path.join(root, 'supabase/migrations/20261110000000_snapshot_revision.sql'), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [first]);
    assert.deepEqual((await db.query('select payload,revision from public.forge_snapshots')).rows, [{ payload: { legacy: true }, revision: 1 }]);
    const updated = await db.query("update public.forge_snapshots set payload='{\"a\":1}',revision=500 where user_id=$1 and revision=1 returning revision", [first]);
    assert.deepEqual(updated.rows, [{ revision: 2 }]);
    const stale = await db.query("update public.forge_snapshots set payload='{\"stale\":1}' where user_id=$1 and revision=1 returning revision", [first]);
    assert.equal(stale.rows.length, 0);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [second]);
    assert.equal((await db.query('select * from public.forge_snapshots')).rows.length, 0);
    assert.equal((await db.query('delete from public.forge_snapshots where user_id=$1 returning user_id', [first])).rows.length, 0);
    assert.equal((await db.query("update public.forge_snapshots set payload='{}' where user_id=$1 returning user_id", [first])).rows.length, 0);
    await assert.rejects(db.query("insert into public.forge_snapshots(user_id,payload) values($1,'{}')", [first]), /row-level security/i);
    const inserted = await db.query("insert into public.forge_snapshots(user_id,payload,revision) values($1,'{}',500) returning revision", [second]);
    assert.deepEqual(inserted.rows, [{ revision: 1 }]);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select * from public.forge_snapshots'), /permission denied/i);
    await db.exec('reset role;');
    await db.query('delete from auth.users where id=$1', [first]);
    assert.deepEqual((await db.query('select user_id from public.forge_snapshots')).rows, [{ user_id: second }]);
  } finally { await db.close(); }
});
