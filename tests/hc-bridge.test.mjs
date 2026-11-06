import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {hiddenClearancesBookmark} from '../lib/hc-session-bridge.ts';
import {allowedHcConnectionOrigin} from '../lib/hc-connection-origin.ts';

test('connection writes require the real browser origin, including local Next hosts', () => {
  const request = (url, origin, host) => new Request(url, {headers: {...(origin ? {origin} : {}), ...(host ? {host} : {})}});
  assert.equal(allowedHcConnectionOrigin(request('http://localhost:3012/api/hc-session', 'http://127.0.0.1:3012', '127.0.0.1:3012')), true);
  assert.equal(allowedHcConnectionOrigin(request('https://radar.example/api/hc-session', 'https://radar.example')), true);
  assert.equal(allowedHcConnectionOrigin(request('https://radar.example/api/hc-session', 'https://evil.example')), false);
  assert.equal(allowedHcConnectionOrigin(request('https://radar.example/api/hc-session')), false);
  assert.equal(allowedHcConnectionOrigin(request('http://radar.example/api/hc-session', 'http://radar.example')), false);
});

test('bookmark transfers only HC tokens after checking the popup, origin and challenge', () => {
  const script = decodeURIComponent(hiddenClearancesBookmark('https://radar.example').slice('javascript:'.length));
  const raw = 'base64-' + Buffer.from(JSON.stringify({access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', provider_token: 'google-do-not-send', user: {email: 'not-sent'}})).toString('base64url');
  const middle = Math.floor(raw.length / 2), name = 'sb-cdqqxarqppyvctffzsax-auth-token';
  let listener, popupUrl; const sent = [];
  const popup = {postMessage: (data, origin) => sent.push({data, origin})};
  const fakeWindow = {open: url => {popupUrl = url; return popup;}, addEventListener: (_type, fn) => {listener = fn;}, removeEventListener() {}};
  vm.runInNewContext(script, {location: {origin: 'https://www.hiddenclearances.com'}, document: {cookie: `_ga=analytics; ${name}.1=${raw.slice(middle)}; ${name}.0=${raw.slice(0, middle)}`}, window: fakeWindow, crypto, TextDecoder, Uint8Array, atob, setTimeout: () => 1, clearTimeout() {}, alert() {throw Error('Unexpected alert');}});
  assert.ok(popupUrl.startsWith('https://radar.example/connect/hidden-clearances#pair='));
  const challenge = popupUrl.split('pair=')[1];
  assert.equal(sent.length, 0);
  listener({origin: 'https://evil.example', source: popup, data: {type: 'radar-hc-ready', challenge}});
  listener({origin: 'https://radar.example', source: {}, data: {type: 'radar-hc-ready', challenge}});
  assert.equal(sent.length, 0);
  listener({origin: 'https://radar.example', source: popup, data: {type: 'radar-hc-ready', challenge}});
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), [{origin: 'https://radar.example', data: {type: 'radar-hc-session', challenge, accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh'}}]);
  assert.ok(!popupUrl.includes('synthetic-access'));
});

test('bookmark refuses non-HTTPS remote destinations and other source sites', () => {
  assert.throws(() => hiddenClearancesBookmark('http://external.example'));
  assert.throws(() => hiddenClearancesBookmark('javascript:alert(1)'));
  assert.throws(() => hiddenClearancesBookmark('https://user:pass@radar.example'));
  let alerted = false;
  vm.runInNewContext(decodeURIComponent(hiddenClearancesBookmark('https://radar.example').slice(11)), {location: {origin: 'https://other.example'}, alert() {alerted = true;}});
  assert.equal(alerted, true);
});
