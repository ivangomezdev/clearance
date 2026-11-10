import test from 'node:test';
import assert from 'node:assert/strict';
import {dealPrice, discount} from '../lib/deals.ts';

const snowBlower = {
  id: '7e703e84-a900-4392-9e2d-05b3e6170b12', title: '$1100 SNOW BLOWER FOR $140', headline: '$1100 SNOW BLOWER FOR $140',
  retailer: 'lowes', discountedPrice: '140.00', originalPrice: '1100.00', discountOff: '.870',
  dealContent: "Will sell out at this price at Lowe's\n\nCheck if you can place an order", isActive: true,
};

test('reported Lowe’s listing is held for review and cannot advertise $140 or 87%', () => {
  const price = dealPrice(snowBlower);
  assert.equal(price.review, true);
  assert.equal(price.verification, 'reported_mismatch');
  assert.equal(price.amount, null);
  assert.equal(price.original, null);
  assert.equal(discount(snowBlower), 0);
  assert.equal(price.title, 'SNOW BLOWER');
  assert.match(price.reason, /pendiente de comprobación/);
  assert.equal(snowBlower.discountedPrice, '140.00');
});

test('a user-reported replacement price never becomes a verified price', () => {
  assert.notEqual(dealPrice(snowBlower).amount, 400);
  const corrected = {...snowBlower, headline: 'SNOW BLOWER', title: 'SNOW BLOWER', discountedPrice: '399.99'};
  const price = dealPrice(corrected);
  assert.equal(price.amount, 399.99);
  assert.equal(price.review, false);
  assert.equal(price.verification, 'unverified');
});

test('the report applies only to its listing, not unrelated products at the same price', () => {
  const price = dealPrice({...snowBlower, id: 'different-listing'});
  assert.equal(price.amount, 140);
  assert.equal(price.review, false);
  assert.equal(price.verification, 'unverified');
});

test('consistent arithmetic does not count as retailer verification', () => {
  const price = dealPrice({title: 'Example item', discountedPrice: '10.00', originalPrice: '100.00'});
  assert.equal(price.discount, 90);
  assert.equal(price.verification, 'unverified');
});
