import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {accountInitials, accountOrigin, planLabel, sameOriginRequest, validateRegistration} from '../lib/account.ts';

const valid = {username: 'Mi_usuario', email: ' USER@example.com ', password: 'a good password', dateOfBirth: '2000-02-29'};
const userA = '00000000-0000-4000-8000-000000000001', userB = '00000000-0000-4000-8000-000000000002';
let db;
test.before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;`);
  await db.exec(await readFile(new URL('../supabase/migrations/202611100001_accounts.sql', import.meta.url), 'utf8'));
  for (const [id, username] of [[userA, 'alice'], [userB, 'bob']]) {
    await db.query('insert into auth.users values ($1, $2)', [id, JSON.stringify({username, date_of_birth: '2000-02-29', plan: 'paid'})]);
  }
});
test.after(async () => {await db?.close();});

test('registration requires all four fields and rejects future or invalid calendar dates', () => {
  assert.equal(validateRegistration(valid).email, 'user@example.com');
  for (const changes of [{username: 'ab'}, {username: 'bad user'}, {email: 'invalid'}, {password: 'short'}, {dateOfBirth: ''}, {dateOfBirth: '2001-02-29'}, {dateOfBirth: '9999-01-01'}]) {
    assert.throws(() => validateRegistration({...valid, ...changes}));
  }
});

test('mutations reject cross-origin and missing-origin requests', () => {
  const request = headers => new Request('https://radar.example/api/auth/login', {method: 'POST', headers});
  assert.equal(sameOriginRequest(request({Origin: 'https://radar.example'})), true);
  assert.equal(sameOriginRequest(request({Origin: 'https://attacker.example'})), false);
  assert.equal(sameOriginRequest(request({})), false);
  assert.equal(sameOriginRequest(request({Origin: 'https://radar.example', 'Sec-Fetch-Site': 'cross-site'})), false);
  const loopback = new Request('http://localhost:3010/api/auth/login', {headers: {Host: '127.0.0.1:3010', Origin: 'http://127.0.0.1:3010'}});
  assert.equal(sameOriginRequest(loopback), true);
  assert.equal(accountOrigin(loopback), 'http://127.0.0.1:3010');
});

test('account initials come from the username and plan display handles absent plans', () => {
  assert.equal(accountInitials(' alice '), 'AL');
  assert.equal(planLabel('free'), 'Plan Gratis');
  assert.equal(planLabel(null), 'Plan pendiente');
});

test('database creates a profile atomically and ignores client-supplied plans', async () => {
  const {rows} = await db.query('select username, plan, date_of_birth::text from public.profiles where id = $1', [userA]);
  assert.deepEqual(rows, [{username: 'alice', plan: 'free', date_of_birth: '2000-02-29'}]);
});

test('duplicate usernames are case-insensitive and failed signups leave no auth account', async () => {
  const id = '00000000-0000-4000-8000-000000000003';
  await assert.rejects(db.query('insert into auth.users values ($1, $2)', [id, JSON.stringify({username: 'ALICE', date_of_birth: '2000-01-01'})]), /duplicate key/);
  assert.equal((await db.query('select * from auth.users where id = $1', [id])).rows.length, 0);
});

test('RLS lets a user see only their own profile and forbids plan changes', async () => {
  await db.exec('set role authenticated');
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
    const {rows} = await db.query('select username from public.profiles');
    assert.deepEqual(rows, [{username: 'alice'}]);
    assert.equal((await db.query('select date_of_birth from public.profiles where id = $1', [userB])).rows.length, 0);
    await assert.rejects(db.query("update public.profiles set plan = 'paid' where id = $1", [userA]), /permission denied/);
  } finally {await db.exec('reset role');}
});

test('anonymous visitors cannot read profiles but can check a username', async () => {
  await db.exec('set role anon');
  try {
    await assert.rejects(db.query('select * from public.profiles'), /permission denied/);
    assert.equal((await db.query("select public.is_username_available('ALICE') as available")).rows[0].available, false);
    assert.equal((await db.query("select public.is_username_available('new_name') as available")).rows[0].available, true);
  } finally {await db.exec('reset role');}
});
