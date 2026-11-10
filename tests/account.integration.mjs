// Run after npm run build:vercel. Uses synthetic accounts and a local Auth fixture;
// it never contacts a real Supabase project or uses the checkout's account keys.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

const id = '00000000-0000-4000-8000-000000000001';
const user = {id, aud: 'authenticated', role: 'authenticated', email: 'demo@example.test', email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {username: 'demo_user'}};
const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encoded({alg: 'HS256', typ: 'JWT'})}.${encoded({sub: id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600})}.fixture-signature`;
const session = {access_token: token, refresh_token: 'fixture-refresh-token', token_type: 'bearer', expires_in: 3600, user};
let registration;
const fixture = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://fixture');
  let raw = ''; for await (const chunk of request) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const send = (data, status = 200) => {response.writeHead(status, {'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01'}); response.end(JSON.stringify(data));};
  if (url.pathname === '/auth/v1/token') {
    if (body.email === user.email && body.password === 'fixture-password') return send(session);
    if (body.auth_code === 'fixture-code' && typeof body.code_verifier === 'string' && body.code_verifier.length > 20) return send(session);
    if (body.refresh_token === 'fixture-refresh-token') return send(session);
    if (body.refresh_token) return send({code: 'refresh_token_not_found', msg: 'Session ended'}, 400);
    return send({code: 'invalid_credentials', msg: 'Invalid credentials'}, 400);
  }
  if (url.pathname === '/auth/v1/user') return request.headers.authorization === `Bearer ${token}` ? send(user) : send({code: 'bad_jwt', msg: 'Invalid token'}, 401);
  if (url.pathname === '/rest/v1/profiles') return send(request.headers.accept?.includes('vnd.pgrst.object') ? {username: 'demo_user', plan: 'free'} : [{username: 'demo_user', plan: 'free'}]);
  if (url.pathname === '/rest/v1/rpc/is_username_available') return send(body.candidate !== 'taken_user');
  if (url.pathname === '/auth/v1/signup') {registration = body; return send(user);}
  if (url.pathname === '/auth/v1/logout') {response.writeHead(204); return response.end();}
  send({error: 'Unknown fixture endpoint'}, 404);
});
fixture.listen(0, '127.0.0.1'); await once(fixture, 'listening');
const fixturePort = fixture.address().port;
const lease = createServer(); lease.listen(0, '127.0.0.1'); await once(lease, 'listening');
const port = lease.address().port; await new Promise(resolve => lease.close(resolve));
const base = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  env: {...process.env, SUPABASE_URL: `http://127.0.0.1:${fixturePort}`, SUPABASE_PUBLISHABLE_KEY: 'fixture-publishable-key'},
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let output = ''; app.stdout.on('data', chunk => {output = (output + chunk).slice(-3000);}); app.stderr.on('data', chunk => {output = (output + chunk).slice(-3000);});
const post = (path, body, cookie = '') => fetch(base + path, {method: 'POST', headers: {Origin: base, 'Content-Type': 'application/json', Cookie: cookie}, body: JSON.stringify(body)});
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {if ((await fetch(base + '/api/account')).ok) {ready = true; break;}} catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, output);
  assert.deepEqual(await (await fetch(base + '/api/account')).json(), {configured: true, user: null});
  assert.equal((await post('/api/auth/login', {email: user.email, password: 'wrong-password'})).status, 401);
  const register = await post('/api/auth/register', {username: 'new_user', email: 'new@example.test', password: 'fixture-password', dateOfBirth: '2000-01-01', plan: 'paid'});
  assert.equal(register.status, 200);
  assert.deepEqual(await register.json(), {success: true, confirmationRequired: true});
  assert.deepEqual(registration.data, {username: 'new_user', date_of_birth: '2000-01-01'});
  const verifier = register.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(verifier.includes('code-verifier'), 'registration must persist the PKCE verifier');
  const confirmed = await fetch(base + '/auth/callback?code=fixture-code', {redirect: 'manual', headers: {Cookie: verifier}});
  assert.equal(confirmed.status, 307);
  assert.equal(confirmed.headers.get('location'), base + '/');
  assert.ok(confirmed.headers.getSetCookie().some(value => /HttpOnly/i.test(value)));
  assert.equal((await post('/api/auth/register', {username: 'taken_user', email: 'other@example.test', password: 'fixture-password', dateOfBirth: '2000-01-01'})).status, 409);
  const login = await post('/api/auth/login', {email: user.email, password: 'fixture-password'});
  assert.equal(login.status, 200);
  const cookies = login.headers.getSetCookie();
  assert.ok(cookies.length > 0, 'sign-in must set session cookies');
  assert.ok(cookies.every(value => /HttpOnly/i.test(value) && /SameSite=lax/i.test(value)));
  const cookie = cookies.map(value => value.split(';')[0]).join('; ');
  const account = await fetch(base + '/api/account', {headers: {Cookie: cookie}});
  assert.match(account.headers.get('cache-control'), /private, no-store/);
  assert.deepEqual(await account.json(), {configured: true, user: {id, email: user.email, username: 'demo_user', plan: 'free'}});
  const stored = cookies.map(value => value.split(';')[0]).find(value => value.startsWith('radar-account='));
  assert.ok(stored, 'fixture session should fit one cookie');
  const staleSession = JSON.parse(Buffer.from(decodeURIComponent(stored.slice('radar-account='.length)).replace(/^base64-/, ''), 'base64url').toString());
  staleSession.expires_at = Math.floor(Date.now() / 1000) - 60;
  const expiredCookie = `radar-account=base64-${Buffer.from(JSON.stringify(staleSession)).toString('base64url')}`;
  const refreshed = await fetch(base + '/api/account', {headers: {Cookie: expiredCookie}});
  assert.equal((await refreshed.json()).user?.username, 'demo_user');
  assert.ok(refreshed.headers.getSetCookie().some(value => /HttpOnly/i.test(value)), 'expired sessions must refresh their cookies');
  staleSession.refresh_token = 'revoked-fixture-token';
  const revokedCookie = `radar-account=base64-${Buffer.from(JSON.stringify(staleSession)).toString('base64url')}`;
  const revoked = await fetch(base + '/api/account', {headers: {Cookie: revokedCookie}});
  assert.equal(revoked.status, 200);
  assert.equal((await revoked.json()).user, null, 'revoked sessions must return to the signed-out UI');
  const spoof = await fetch(base + '/api/account', {headers: {'oai-authenticated-user-id': id, 'oai-authenticated-user-email': user.email}});
  assert.equal((await spoof.json()).user, null);
  const logout = await post('/api/auth/logout', {}, cookie);
  assert.equal(logout.status, 200);
  assert.ok(logout.headers.getSetCookie().some(value => /Max-Age=0/i.test(value)));
  console.log('Account HTTP integration passed: registration, PKCE confirmation, login, verified profile, HttpOnly cookies, refresh, logout and forged identity headers.');
} finally {
  app.kill();
  await new Promise(resolve => fixture.close(resolve));
}
