import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeStorePrice} from '../lib/store-price.ts';
import {dealPrice, discount} from '../lib/deals.ts';
import {STOCK_CACHE_AGE} from '../lib/store-availability-client.ts';

const now = Date.parse('2026-11-10T08:00:00Z');
const stock = stores => ({sku: '321778443', zip: '33101', checkedAt: new Date(now).toISOString(), stores});
const store = (price, inStock = true, quantity = inStock ? 3 : 0) => ({storeId: '0251', name: 'Test store', price, inStock, quantity, address: '', distance: 1, itemLocation: null, productUrl: 'https://www.homedepot.com/p/321778443?store=0251'});

test('screenshot regression: $15 post and $131.10 out-of-stock stores never produce an available price', () => {
  const summary = summarizeStorePrice(15, stock([store(131.10, false), store(131.10, false)]), now);
  assert.equal(summary.status, 'unavailable');
  assert.equal(summary.available, 0);
  assert.equal(summary.prices, null);
  assert.equal(summary.publishedAvailable, false);
  assert.deepEqual(summary.unavailablePrices, {min: 131.10, max: 131.10});
});

test('store-only publications do not advertise an unverified local price or discount', () => {
  const deal = {title: '70 lbs. Residential Broadcast Ice Melt and Salt Spreader', retailer: 'home_depot', source: 'feed', kind: 'in_store', discountedPrice: '15.00', originalPrice: '132.42', discountOff: '.89'};
  const price = dealPrice(deal);
  assert.equal(price.scope, 'store');
  assert.equal(price.publishedAmount, 15);
  assert.equal(price.amount, null);
  assert.equal(price.original, null);
  assert.equal(discount(deal), 0);
  assert.equal(price.review, false);
  assert.equal(deal.discountedPrice, '15.00');
});

test('online offers keep their published price and percentage behavior', () => {
  const price = dealPrice({title: 'Spreader', retailer: 'home_depot', discountedPrice: '15.00', originalPrice: '132.42', discountOff: '.89'});
  assert.equal(price.amount, 15);
  assert.equal(price.discount, 89);
  assert.equal(price.scope, undefined);
});

test('an unavailable cheap branch cannot lower the range from stores with stock', () => {
  const summary = summarizeStorePrice(15, stock([store(15, false), store(131.10), store(140)]), now);
  assert.equal(summary.status, 'available');
  assert.deepEqual(summary.prices, {min: 131.10, max: 140});
  assert.equal(summary.publishedAvailable, false);
});

test('a published price is matched only if that branch has stock', () => {
  assert.equal(summarizeStorePrice(15, stock([store(15)]), now).publishedAvailable, true);
  const summary = summarizeStorePrice(15, stock([store(15, true, 0)]), now);
  assert.equal(summary.status, 'unavailable');
  assert.equal(summary.publishedAvailable, false);
});

test('unknown and zero prices are not presented as free available products', () => {
  const summary = summarizeStorePrice(15, stock([store(null), store(0)]), now);
  assert.equal(summary.status, 'available');
  assert.equal(summary.prices, null);
  assert.equal(summary.unpriced, 2);
});

test('no lookup, an old lookup and a future timestamp are distinct from no stock', () => {
  assert.equal(summarizeStorePrice(15, null, now).status, 'unqueried');
  const result = stock([store(15)]);
  assert.equal(summarizeStorePrice(15, result, now + STOCK_CACHE_AGE).status, 'stale');
  assert.equal(summarizeStorePrice(15, result, now - 1).status, 'stale');
  assert.equal(summarizeStorePrice(15, stock([]), now).status, 'unavailable');
});
