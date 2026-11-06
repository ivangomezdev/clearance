import test from 'node:test';
import assert from 'node:assert/strict';
import {sealHcSession, openHcSession, hcSessionForRequest, connectHcSession} from '../lib/hc-session-service.ts';

const key = Buffer.alloc(32, 9).toString('base64url');
const config = {HC_SESSION_SECRET: key};
const userId = 'synthetic-test-user', sessionId = 'synthetic-session';
const now = Date.now();
function jwt(expires, user = userId) {return 'e30.' + Buffer.from(JSON.stringify({iss: 'https://cdqqxarqppyvctffzsax.supabase.co/auth/v1', exp: Math.floor(expires / 1000), sub: user, session_id: sessionId})).toString('base64url') + '.synthetic-signature';}
function fixture(expires = now + 3600000) {return {accessToken: jwt(expires), refreshToken: 'synthetic_' + crypto.randomUUID().replaceAll('-', '')};}
async function requestFor(value) {return new Request('https://radar.example/api/stock', {headers: {cookie: '__Host-radar-hc.0=' + await sealHcSession(value, key)}});}
function responseFor(value) {return Response.json({access_token: value.accessToken, refresh_token: value.refreshToken});}

test('encrypted session rejects tampering and never returns credentials in metadata', async () => {
  const original = fixture(), sealed = await sealHcSession(original, key);
  assert.ok(!sealed.includes(original.refreshToken));
  assert.deepEqual(await openHcSession(sealed, key), original);
  const middle = Math.floor(sealed.length / 2), changed = sealed.slice(0, middle) + (sealed[middle] === 'a' ? 'b' : 'a') + sealed.slice(middle + 1);
  await assert.rejects(openHcSession(changed, key));
  await assert.rejects(openHcSession(sealed, Buffer.alloc(32, 7).toString('base64url')));
  const session = await hcSessionForRequest(await requestFor(original), config, () => {throw Error('Unexpected refresh');}, () => now);
  assert.equal(session.token, original.accessToken);
  assert.equal(session.info.renewable, true);
  assert.ok(!JSON.stringify(session.info).includes(original.accessToken));
});

test('expired session refreshes automatically and persists the rotated tokens in HttpOnly cookies', async () => {
  const original = fixture(now - 1000), next = fixture(now + 3600000);
  let calls = 0;
  const session = await hcSessionForRequest(await requestFor(original), config, async (url, options) => {
    calls++;
    assert.equal(url, 'https://cdqqxarqppyvctffzsax.supabase.co/auth/v1/token?grant_type=refresh_token');
    assert.equal(JSON.parse(options.body).refresh_token, original.refreshToken);
    assert.equal(options.redirect, 'error');
    return responseFor(next);
  }, () => now);
  assert.equal(calls, 1); assert.equal(session.token, next.accessToken);
  const response = session.apply(Response.json({session: session.info}));
  const cookies = response.headers.getSetCookie();
  assert.match(cookies[0], /HttpOnly; SameSite=Lax; Max-Age=2592000; Secure/);
  assert.ok(!cookies[0].includes('Domain='));
  const packed = cookies.filter(c => !c.includes('Max-Age=0')).map(c => c.split(';')[0].split('=').slice(1).join('=')).join('');
  assert.deepEqual(await openHcSession(packed, key), next);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.ok(!(await response.text()).includes(next.refreshToken));
  // A new request uses the persisted replacement without consulting the old environment token.
  const continued = await hcSessionForRequest(new Request('https://radar.example/api/feed', {headers: {cookie: cookies.filter(c => !c.includes('Max-Age=0')).map(c => c.split(';')[0]).join('; ')}}), config, () => {throw Error('Not due');}, () => now);
  assert.equal(continued.token, next.accessToken);
});

test('parallel requests share one rotation and refresh ahead of expiration', async () => {
  const original = fixture(now + 60000), next = fixture(now + 3600000);
  const request = await requestFor(original); let calls = 0;
  const fetcher = async () => {calls++; await new Promise(resolve => setTimeout(resolve, 5)); return responseFor(next);};
  const results = await Promise.all([hcSessionForRequest(request, config, fetcher, () => now), hcSessionForRequest(request, config, fetcher, () => now)]);
  assert.equal(calls, 1);
  for (const result of results) assert.equal(result.token, next.accessToken);
});

test('temporary refresh failure preserves the session for retry; revoked refresh clears it', async () => {
  const original = fixture(now - 1000), request = await requestFor(original);
  const temporary = await hcSessionForRequest(request, config, async () => new Response(null, {status: 503}), () => now);
  assert.equal(temporary.info.renewalError, true);
  assert.deepEqual(temporary.apply(new Response()).headers.getSetCookie(), []);
  const revoked = await hcSessionForRequest(request, config, async () => new Response(null, {status: 400}), () => now);
  assert.equal(revoked.token, undefined); assert.equal(revoked.info.status, 'rejected');
  assert.ok(revoked.apply(new Response()).headers.getSetCookie().every(c => c.includes('Max-Age=0')));
});

test('a changed user from a refresh response is rejected and corrupted cookies do not use the shared fallback', async () => {
  const original = fixture(now - 1000);
  const session = await hcSessionForRequest(await requestFor(original), config, async () => responseFor({...fixture(), accessToken: jwt(now + 3600000, 'other-user')}), () => now);
  assert.equal(session.token, undefined); assert.equal(session.info.renewalError, true);
  const corrupt = await hcSessionForRequest(new Request('https://radar.example/api/feed', {headers: {cookie: '__Host-radar-hc.0=invalid'}}), {...config, HC_ACCESS_TOKEN: jwt(now + 3600000)});
  assert.equal(corrupt.token, undefined); assert.equal(corrupt.info.status, 'invalid');
});

test('connecting requires issuer verification and stores only the two HC tokens', async () => {
  const original = fixture();
  const request = new Request('https://radar.example/api/hc-session');
  await assert.rejects(connectHcSession(request, original, config, async () => new Response(null, {status: 401})));
  const result = await connectHcSession(request, {...original, provider_token: 'not-forwarded', user: {email: 'not-stored'}}, config, async (url, options) => {
    assert.equal(url, 'https://cdqqxarqppyvctffzsax.supabase.co/auth/v1/user');
    assert.equal(options.headers.Authorization, 'Bearer ' + original.accessToken);
    return Response.json({id: userId});
  });
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.deepEqual(Object.keys(body), ['session']);
  assert.equal(body.session.renewable, true);
  const packed = result.headers.getSetCookie()[0].split(';')[0].split('=').slice(1).join('=');
  assert.deepEqual(await openHcSession(packed, key), original);
});

test('large sessions survive cookie chunking without exposing their content', async () => {
  const original = fixture();
  const decoded = JSON.parse(Buffer.from(original.accessToken.split('.')[1], 'base64url'));
  original.accessToken = 'e30.' + Buffer.from(JSON.stringify({...decoded, metadata: 'x'.repeat(4500)})).toString('base64url') + '.synthetic-signature';
  const response = await connectHcSession(new Request('https://radar.example/api/hc-session'), original, config, async () => Response.json({id: userId}));
  const parts = response.headers.getSetCookie().filter(c => !c.includes('Max-Age=0'));
  assert.ok(parts.length > 1);
  assert.ok(parts.every(part => part.length < 4096));
  const request = new Request('https://radar.example/api/feed', {headers: {cookie: parts.map(c => c.split(';')[0]).reverse().join('; ')}});
  const session = await hcSessionForRequest(request, config, () => {throw Error('Unnecessary refresh');}, () => now);
  assert.equal(session.token, original.accessToken);
});
