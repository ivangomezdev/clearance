import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedHcSession, connectSharedHcSession, disconnectSharedHcSession} from '../lib/hc-shared-session.ts';
import {sealHcSession, openHcSession} from '../lib/hc-session-service.ts';
import {authorizeHcAdmin, isHcAdmin} from '../lib/hc-admin.ts';
import {mutateVault} from '../lib/hc-session-vault.ts';

const now = Date.now(), secret = Buffer.alloc(32, 8).toString('base64url');
const config = {HC_SESSION_SECRET: secret, HC_SHARED_SESSION_MODE: 'true'};
function token(expires, sub = 'synthetic-owner') {return 'e30.' + Buffer.from(JSON.stringify({iss: 'https://cdqqxarqppyvctffzsax.supabase.co/auth/v1', exp: Math.floor(expires / 1000), sub, session_id: 'synthetic-shared-session'})).toString('base64url') + '.synthetic-signature';}
function fixture(expires = now + 3600000, sub) {return {accessToken: token(expires, sub), refreshToken: 'synthetic_' + crypto.randomUUID().replaceAll('-', '')};}
function vault(seed = {version: 1}) {
  let current = structuredClone(seed), revision = 1;
  return {
    writes: [],
    async read() {return {record: structuredClone(current), etag: String(revision)};},
    async write(expected, next) {if (expected !== String(revision)) return null; this.writes.push(structuredClone(next)); current = structuredClone(next); revision++; return this.read();},
  };
}

test('shared inventory works without a visitor login and never sends HC cookies to the visitor', async () => {
  const credentials = fixture(), store = vault({version: 1, sealed: await sealHcSession(credentials, secret)});
  const session = await sharedHcSession(config, () => {throw Error('Not due');}, () => now, store);
  assert.equal(session.token, credentials.accessToken);
  assert.equal(session.info.shared, true);
  const response = session.apply(Response.json({session: session.info}));
  assert.deepEqual(response.headers.getSetCookie(), []);
  assert.ok(!(await response.text()).includes(credentials.refreshToken));
});

test('shared concurrent refresh persists exactly one replacement using the vault lease', async () => {
  const original = fixture(now - 1000), next = fixture();
  const store = vault({version: 1, sealed: await sealHcSession(original, secret)});
  let requests = 0;
  const fetcher = async () => {requests++; await new Promise(resolve => setTimeout(resolve, 10)); return Response.json({access_token: next.accessToken, refresh_token: next.refreshToken});};
  const sessions = await Promise.all([sharedHcSession(config, fetcher, () => now, store), sharedHcSession(config, fetcher, () => now, store)]);
  assert.equal(requests, 1);
  assert.equal(store.writes.filter(r => r.lock).length, 1);
  assert.ok(sessions.every(session => session.token === next.accessToken));
  const saved = (await store.read()).record;
  assert.equal(saved.lock, undefined);
  assert.deepEqual(await openHcSession(saved.sealed, secret), next);
});

test('an in-flight refresh cannot overwrite an owner replacement', async () => {
  const old = fixture(now - 1000), refreshedOld = fixture(), replacement = fixture(now + 3600000, 'new-synthetic-owner');
  const store = vault({version: 1, sealed: await sealHcSession(old, secret)});
  const replacementSealed = await sealHcSession(replacement, secret);
  const session = await sharedHcSession(config, async () => {
    await mutateVault(store, current => ({...current, sealed: replacementSealed, lock: undefined}));
    return Response.json({access_token: refreshedOld.accessToken, refresh_token: refreshedOld.refreshToken});
  }, () => now, store);
  assert.equal(session.token, replacement.accessToken);
  assert.equal((await store.read()).record.sealed, replacementSealed);
});

test('revocation clears shared credentials while a temporary failure preserves them', async () => {
  const sealed = await sealHcSession(fixture(now - 1000), secret);
  const temporaryStore = vault({version: 1, sealed});
  const temporary = await sharedHcSession(config, async () => new Response(null, {status: 503}), () => now, temporaryStore);
  assert.equal(temporary.info.renewalError, true);
  assert.equal((await temporaryStore.read()).record.sealed, sealed);
  assert.equal((await temporaryStore.read()).record.lock, undefined);
  const revokedStore = vault({version: 1, sealed, usedSetupHash: 'retain-owner-bootstrap-history'});
  const revoked = await sharedHcSession(config, async () => new Response(null, {status: 400}), () => now, revokedStore);
  assert.equal(revoked.token, undefined); assert.equal(revoked.info.status, 'rejected');
  assert.equal((await revokedStore.read()).record.sealed, undefined);
  assert.equal((await revokedStore.read()).record.usedSetupHash, 'retain-owner-bootstrap-history');
});

test('shared connection verifies the account and stores encrypted tokens only', async () => {
  const store = vault(), credentials = fixture();
  await assert.rejects(connectSharedHcSession(credentials, config, async () => new Response(null, {status: 401}), store));
  assert.equal((await store.read()).record.sealed, undefined);
  const result = await connectSharedHcSession({...credentials, provider_token: 'not-stored'}, config, async () => Response.json({id: 'synthetic-owner'}), store);
  assert.equal(result.session.shared, true);
  assert.ok(!JSON.stringify((await store.read()).record).includes(credentials.refreshToken));
  await disconnectSharedHcSession(config, store);
  assert.equal((await store.read()).record.sealed, undefined);
});

test('owner setup link is one-use and produces a signed private cookie, not a public password', async () => {
  const setup = Buffer.alloc(32, 6).toString('base64url');
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(setup))).toString('hex');
  const settings = {...config, HC_ADMIN_SETUP_HASH: hash, HC_ADMIN_SETUP_EXPIRES_AT: String(now + 60000)};
  const request = new Request('https://radar.example/api/hc-admin'), store = vault();
  assert.equal(await isHcAdmin(request, settings, now), false);
  await assert.rejects(authorizeHcAdmin(request, Buffer.alloc(32, 1).toString('base64url'), settings, store, now));
  const response = await authorizeHcAdmin(request, setup, settings, store, now);
  const cookie = response.headers.getSetCookie()[0];
  assert.match(cookie, /HttpOnly; SameSite=Lax; Max-Age=2592000; Secure/);
  assert.ok(!cookie.includes(setup));
  const authorized = new Request(request, {headers: {cookie: cookie.split(';')[0]}});
  assert.equal(await isHcAdmin(authorized, settings, now), true);
  assert.equal(await isHcAdmin(authorized, settings, now + 31 * 86400000), false);
  const damaged = new Request(request, {headers: {cookie: cookie.split(';')[0] + 'tampered'}});
  assert.equal(await isHcAdmin(damaged, settings, now), false);
  await assert.rejects(authorizeHcAdmin(request, setup, settings, store, now));
  await assert.rejects(authorizeHcAdmin(request, setup, settings, vault(), now + 61000));
});

test('setup failures distinguish expired links, replay and storage faults without leaking the invitation', async () => {
  const setup = Buffer.alloc(32, 4).toString('base64url');
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(setup))).toString('hex');
  const settings = {...config, HC_ADMIN_SETUP_HASH: hash, HC_ADMIN_SETUP_EXPIRES_AT: String(now + 60000)};
  const request = new Request('https://radar.example/api/hc-admin');
  const isCode = code => error => error.code === code && !error.message.includes(setup);
  await assert.rejects(authorizeHcAdmin(request, setup, settings, vault(), now + 61000), isCode('EXPIRED_LINK'));
  await assert.rejects(authorizeHcAdmin(request, setup, config, vault(), now), isCode('NOT_CONFIGURED'));
  await assert.rejects(authorizeHcAdmin(request, setup, settings, {async read() {throw Error('synthetic storage fault');}}, now), isCode('STORAGE_UNAVAILABLE'));
  const used = vault({version: 1, usedSetupHash: hash});
  await assert.rejects(authorizeHcAdmin(request, setup, settings, used, now), isCode('USED_LINK'));
});
