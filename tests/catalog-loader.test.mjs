import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCatalog} from '../lib/catalog-loader.ts';
import {QUICK_RETAILERS, retailerOptions} from '../lib/retailers.ts';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const pageResponse = (page, totalPages, data = [], extra = {}) => Response.json({data, pagination: {page, totalPages, total: totalPages * 50}, ...extra});
const request = url => ({source: url.includes('/feed?') ? 'feed' : 'deals', page: Number(new URL(url, 'http://local').searchParams.get('page'))});
const options = extra => ({signal: new AbortController().signal, includeHistory: false, spacingMs: 0, onChange() {}, ...extra});

test('main store filters exist before data and never reorder as counts change', () => {
  const empty = retailerOptions([]), loaded = retailerOptions([{retailer: 'walmart'}, {retailer: 'walmart'}, {retailer: 'new_shop'}]);
  assert.deepEqual(empty.slice(0, QUICK_RETAILERS.length).map(([store]) => store), [...QUICK_RETAILERS]);
  assert.deepEqual(loaded.slice(0, empty.length).map(([store]) => store), empty.map(([store]) => store));
  assert.equal(loaded.find(([store]) => store === 'walmart')[1], 2);
  assert.deepEqual(loaded.at(-1), ['new_shop', 1]);
});

test('overlaps at most three requests, starts feed early and merges duplicates deterministically', async () => {
  let active = 0, peak = 0, first = 0, snapshot;
  const finished = [];
  await loadCatalog(options({
    onFirstPage() {first++;}, onChange(value) {snapshot = value;},
    async fetcher(url) {
      const {source, page} = request(url); active++; peak = Math.max(peak, active);
      await pause(source === 'deals' && page === 2 ? 45 : 5);
      active--; finished.push(`${source}:${page}`);
      return pageResponse(page, source === 'deals' ? 4 : 2,
        source === 'deals' ? [{id: page === 2 ? 'shared' : `catalog-${page}`, title: 'catalog'}]
          : [{id: page === 1 ? 'shared' : 'feed-only', title: 'feed'}],
        source === 'feed' ? {lockedSkipped: 2} : {});
    },
  }));
  assert.equal(peak, 3);
  assert.equal(first, 1);
  assert.ok(finished.indexOf('feed:1') < finished.indexOf('deals:2'));
  assert.equal(snapshot.completed, 4);
  assert.equal(snapshot.pages, 4);
  assert.equal(snapshot.total, 200);
  assert.equal(snapshot.feedAdded, 1);
  assert.equal(snapshot.feedLocked, 4);
  assert.equal(snapshot.deals.length, 5);
  assert.equal(snapshot.deals.find(deal => deal.id === 'shared').title, 'catalog');
});

test('spaces request starts and shares Retry-After cooldown across both sources', async () => {
  const starts = []; let limited = false, limitedAt = 0;
  await loadCatalog(options({spacingMs: 15, minimumRetryMs: 35,
    onLog(entry) {if (entry.status === 429) limitedAt = Date.now();},
    async fetcher(url) {
      const {source, page} = request(url); starts.push(Date.now());
      if (source === 'deals' && page === 2 && !limited) {
        limited = true;
        return Response.json({error: 'limited'}, {status: 429, headers: {'Retry-After': '0.07'}});
      }
      return pageResponse(page, source === 'deals' ? 4 : 2);
    },
  }));
  assert.ok(limitedAt);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 14, 'requests must stay spaced');
  const later = starts.filter(time => time > limitedAt);
  assert.ok(later.length > 0);
  assert.ok(later[0] - limitedAt >= 69, 'queued requests must respect the shared Retry-After');
});

test('abort cancels in-flight work and prevents subsequent state updates', async () => {
  const controller = new AbortController(); let started = 0, changes = 0;
  const promise = loadCatalog(options({signal: controller.signal, onChange() {changes++;},
    async fetcher(url, init) {
      const {source, page} = request(url); started++;
      if (source === 'deals' && page === 1) return pageResponse(1, 10);
      await new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), {once: true});
      });
    },
  }));
  await pause(10); controller.abort();
  await assert.rejects(promise, {name: 'AbortError'});
  assert.equal(started, 4);
  assert.equal(changes, 1);
});

test('a clamped page fails and preserves only previously validated results', async () => {
  let snapshot;
  await assert.rejects(loadCatalog(options({onChange(value) {snapshot = value;},
    async fetcher(url) {
      const {source, page} = request(url);
      if (source === 'deals' && page === 2) return pageResponse(1, 2, [{id: 'wrong-page'}]);
      return pageResponse(page, source === 'deals' ? 2 : 1, [{id: 'good'}]);
    },
  })), /limita el historial/);
  assert.ok(snapshot.deals.every(deal => deal.id !== 'wrong-page'));
});

test('persistent rate limiting stops after three retries', async () => {
  let attempts = 0;
  await assert.rejects(loadCatalog(options({minimumRetryMs: 0,
    async fetcher() {attempts++; return Response.json({error: 'limited'}, {status: 429});},
  })), /limitó las solicitudes/);
  assert.equal(attempts, 4);
});
