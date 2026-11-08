import test from 'node:test';
import assert from 'node:assert/strict';
import {homeDepotStoreUrl, normalizeHomeDepotStock, parseHomeDepotStockResponse, validZip} from '../lib/store-stock.ts';
import {feedDeals} from '../lib/feed.ts';
import {dealSku} from '../lib/deals.ts';

test('direct Home Depot links preserve leading store zeroes and reject injected destinations', () => {
  assert.equal(homeDepotStoreUrl('339011675', '0251'), 'https://www.homedepot.com/p/339011675?store=0251');
  assert.equal(homeDepotStoreUrl('339011675', '251'), 'https://www.homedepot.com/p/339011675?store=0251');
  assert.equal(homeDepotStoreUrl('339011675?other=1', '0251'), null);
  assert.equal(homeDepotStoreUrl('339011675', '0251&url=https://example.com'), null);
});

test('normalization keeps branch prices and explicit stock and orders by proximity', () => {
  const result = normalizeHomeDepotStock({stores: [
    {storeId: '6310', storeName: 'North Hollywood/Stirling', inStock: true, price: '13.49', totalStock: 3, distance: 18.6},
    {storeId: '0251', storeName: 'N Miami Beach', address: '1245 Ne 163rd St', city: 'North Miami Beach', state: 'FL', zip: '33162', inStock: true, price: 20.4, quantity: 3, distance: '10.7', itemLocation: 'Aisle 29 - Bay 7'},
    {storeId: '0001', inStock: false, quantity: null, price: '', distance: 1},
    {storeId: 'evil.invalid', inStock: true, price: 1},
    {storeId: '0251', inStock: true},
  ]}, '339011675', '33101');
  assert.deepEqual(result.stores.map(store => store.storeId), ['0251', '6310', '0001']);
  assert.equal(result.stores[0].price, 20.4);
  assert.equal(result.stores[0].quantity, 3);
  assert.equal(result.stores[0].productUrl, 'https://www.homedepot.com/p/339011675?store=0251');
  assert.match(result.stores[0].address, /North Miami Beach/);
  assert.equal(result.stores[2].quantity, null);
  assert.equal(result.stores[2].price, null);
  assert.equal(result.stores[2].inStock, false);
});

test('unavailable data and errors do not masquerade as no inventory', () => {
  assert.throws(() => normalizeHomeDepotStock({error: 'denied'}, '339011675', '33101'));
  assert.throws(() => normalizeHomeDepotStock({stores: [{}]}, '339011675', '33101'));
  assert.deepEqual(normalizeHomeDepotStock({stores: []}, '339011675', '33101').stores, []);
  assert.throws(() => normalizeHomeDepotStock({stores: [{storeId: '0251', inStock: 'true', quantity: 10}]}, '339011675', '33101'));
  const store = normalizeHomeDepotStock({stores: [{storeId: '0251', inStock: true, price: false}]}, '339011675', '33101').stores[0];
  assert.equal(store.price, null);
  assert.equal(validZip('03301'), true);
  assert.equal(validZip('3310'), false);
  assert.equal(validZip('33101&x=1'), false);
});

test('unlocked in-store feed preserves the product number for stock checks', () => {
  const entry = {id: 'test', title: 'Harmony Espresso', retailer: 'home_depot', kind: 'in_store', locked: false, sku: '339011675'};
  assert.equal(feedDeals([entry])[0].sku, '339011675');
  assert.equal(feedDeals([{...entry, locked: true}]).length, 0);
  assert.equal(feedDeals([{...entry, sku: null}])[0].sku, undefined);
});

test('stock endpoint accepts the direct response as well as the API data envelope', () => {
  const stock = {item: {productUrl: 'https://www.homedepot.com/p/339011675'}, stores: [{storeId: '0251', storeName: 'N Miami Beach', inStock: true, quantity: 3, price: 20.4}]};
  assert.equal(parseHomeDepotStockResponse(stock, '339011675', '33101').stores[0].storeId, '0251');
  assert.equal(parseHomeDepotStockResponse({success: true, data: stock}, '339011675', '33101').stores[0].price, 20.4);
  assert.throws(() => parseHomeDepotStockResponse({success: false, stores: []}, '339011675', '33101'));
  assert.throws(() => parseHomeDepotStockResponse({error: 'upstream error'}, '339011675', '33101'));
});
test('catalog Home Depot products use their SKU or a direct merchant product number',()=>{
 assert.equal(dealSku({retailer:'home_depot',sku:'339011675'}),'339011675');
 assert.equal(dealSku({retailer:'home_depot',dealLink:'https://www.homedepot.com/p/Espresso/339011675?store=0251'}),'339011675');
 assert.equal(dealSku({retailer:'home_depot',dealLink:'https://other.example/p/339011675'}),undefined);
 assert.equal(dealSku({retailer:'amazon',sku:'339011675'}),undefined);
});
