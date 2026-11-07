import test from 'node:test';
import assert from 'node:assert/strict';
import {createHcOwnerClient} from '../lib/hc-owner-client.ts';

const state = canManage => Response.json({session: {status: 'public', shared: true}, configured: true, canManage});
test('opening or revisiting the setup page does not consume an invitation', async () => {
  let posts = 0;
  const client = createHcOwnerClient(async url => {if (url === '/api/hc-admin') posts++; return state(false);});
  await client.inspect(); await client.inspect();
  assert.equal(posts, 0);
});
test('a new fragment invitation replaces a rejected invitation in the same page', async () => {
  const seen = []; let authorized = false;
  const client = createHcOwnerClient(async (url, options) => {
    if (url === '/api/hc-session') return state(authorized);
    const setup = JSON.parse(options.body).setup; seen.push(setup);
    if (setup === 'old-link') return Response.json({error: 'El enlace fue reemplazado.'}, {status: 401});
    authorized = true; return Response.json({authorized: true});
  });
  assert.equal((await client.check('old-link')).canManage, false);
  assert.equal((await client.check('new-link')).canManage, true);
  assert.deepEqual(seen, ['old-link', 'new-link']);
});

test('effect replay waits for the same one-time exchange even after removing the URL fragment', async () => {
  let posts = 0, authorized = false;
  const client = createHcOwnerClient(async url => {
    if (url === '/api/hc-session') return state(authorized);
    posts++; await new Promise(resolve => setTimeout(resolve, 5)); authorized = true;
    return Response.json({authorized: true});
  });
  const results = await Promise.all([client.check('one-time-link'), client.check()]);
  assert.equal(posts, 1); assert.ok(results.every(r => r.canManage));
});

test('an existing owner session is usable even when the supplied invitation fails', async () => {
  const client = createHcOwnerClient(async url => url === '/api/hc-session' ? state(true) : Response.json({error: 'Ya utilizado.'}, {status: 401}));
  const result = await client.check('used-link');
  assert.equal(result.canManage, true); assert.equal(result.setupError, undefined);
});

test('temporary setup failures retain their actual message and can be retried', async () => {
  let attempts = 0;
  const client = createHcOwnerClient(async url => {
    if (url === '/api/hc-session') return state(attempts > 1);
    attempts++;
    return attempts === 1 ? Response.json({error: 'El almacenamiento no está disponible.'}, {status: 503}) : Response.json({authorized: true});
  });
  assert.match((await client.check('same-link')).setupError, /almacenamiento/);
  assert.equal((await client.check('same-link')).canManage, true);
});
