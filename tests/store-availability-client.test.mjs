import test from 'node:test';
import assert from 'node:assert/strict';
import {cacheStock,cachedStock,lookupStock,rememberZip,rememberedZip,rememberStockCooldown,stockCooldown,STOCK_CACHE_AGE} from '../lib/store-availability-client.ts';
import {normalizeHomeDepotStock} from '../lib/store-stock.ts';
import {rememberOpenDeal,restoredDeal} from '../lib/deal-navigation.ts';
import {stockResponse} from '../lib/store-stock-service.ts';
import {publicCopy} from '../lib/public-copy.ts';
import {feedDeals} from '../lib/feed.ts';

function storage(){const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
const sku='339011675',zip='03301',now=Date.now();
const fixture=()=>({...normalizeHomeDepotStock({stores:[{storeId:'0251',storeName:'Example store',inStock:true,price:20.4,quantity:3,distance:2}]},sku,zip),checkedAt:new Date(now).toISOString()});
const session=(token,info={status:'active'})=>({token,info,async refresh(){return false;},apply:r=>r});

test('a valid ZIP survives a failed request and retains its leading zero',async()=>{
 const local=storage();rememberZip(local,zip);
 await assert.rejects(lookupStock(sku,zip,new AbortController().signal,async()=>Response.json({code:'INVENTORY_CONNECTION_REQUIRED'},{status:503})),e=>e.connectionRequired&&!e.message.includes('preparación'));
 assert.equal(rememberedZip(local),zip);rememberZip(local,'bad');assert.equal(rememberedZip(local),zip);
});
test('returning to the same product restores the result only for that SKU and ZIP',()=>{
 const tab=storage(),result=fixture();cacheStock(tab,result);
 assert.deepEqual(cachedStock(tab,sku,zip,now+10000),result);
 assert.equal(cachedStock(tab,'123456789',zip,now),null);assert.equal(cachedStock(tab,sku,'33101',now),null);
 assert.equal(cachedStock(tab,sku,zip,now+STOCK_CACHE_AGE),null);assert.equal(cachedStock(tab,sku,zip,now-1),null);
 const damaged={...result,stores:[{...result.stores[0],productUrl:'https://example.com/redirect'}]};
 cacheStock(tab,damaged);assert.deepEqual(cachedStock(tab,sku,zip,now),result);
});
test('a full reload restores the open product; closing it clears the selection',()=>{
 const tab=storage(),deal={id:'example-product',title:'Espresso maker',slug:'espresso',retailer:'home_depot',createdAt:new Date(now).toISOString(),isActive:true,source:'feed',sku,originalPrice:'40',discountedPrice:'20',discountOff:'.5'};
 rememberOpenDeal(tab,deal,now);assert.deepEqual(restoredDeal(tab,now+1000),deal);
 assert.equal(restoredDeal(tab,now+31*60000),null);
 rememberOpenDeal(tab,null);assert.equal(restoredDeal(tab),null);
 rememberOpenDeal(tab,{...deal,tags:'bad'},now);assert.equal(restoredDeal(tab,now),null);
});
test('blocked storage does not break stock lookup or ZIP entry',()=>{
 const blocked={getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}};
 assert.equal(rememberedZip(blocked),'');assert.doesNotThrow(()=>rememberZip(blocked,zip));
 assert.doesNotThrow(()=>cacheStock(blocked,fixture()));assert.equal(cachedStock(blocked,sku,zip),null);
 assert.equal(restoredDeal(undefined),null);
});
test('rate limits persist across closing and reopening a product',async()=>{
 const tab=storage();let until;
 await assert.rejects(lookupStock(sku,zip,new AbortController().signal,async()=>Response.json({error:'limit'},{status:429,headers:{'retry-after':'90'}}),now),e=>{until=e.retryAt;return until===now+90000;});
 rememberStockCooldown(tab,until);assert.equal(stockCooldown(tab,now+1000),until);assert.equal(stockCooldown(tab,now+91000),0);
});
test('revoked inventory is a connection error, not an empty store list or a visitor login challenge',async()=>{
 const response=await stockResponse(new Request(`https://radar.example/api/stock?sku=${sku}&zip=${zip}`),async()=>session(undefined,{status:'rejected',shared:true}),()=>{throw Error('Must not call retailer');});
 assert.equal(response.status,503);const body=await response.json();assert.equal(body.code,'INVENTORY_CONNECTION_REQUIRED');assert.equal(body.data,undefined);assert.ok(!body.error.includes('preparación'));
});
test('a temporary connection failure is retryable and stock 401 refreshes once',async()=>{
 const request=new Request(`https://radar.example/api/stock?sku=${sku}&zip=${zip}`);
 const failure=await stockResponse(request,async()=>session(undefined,{status:'invalid',renewalError:true}));
 assert.equal((await failure.json()).code,'INVENTORY_TEMPORARY_UNAVAILABLE');
 const connected=session('synthetic-before');let calls=0,renewals=0;
 connected.refresh=async()=>{renewals++;connected.token='synthetic-after';return true;};
 const r=await stockResponse(request,async()=>connected,async(_url,options)=>{
  calls++;if(calls===1)return new Response(null,{status:401});assert.equal(options.headers.Authorization,'Bearer synthetic-after');
  return Response.json({stores:[{storeId:'0251',inStock:true,price:20}]});
 });
 assert.equal(r.status,200);assert.equal(renewals,1);assert.equal(calls,2);assert.equal((await r.json()).data.zip,zip);
});
test('provider branding and canned feed descriptions are absent from product copy',()=>{
 assert.ok(!/hidden.?clearances/i.test(publicCopy('Hidden Clearances https://www.hiddenclearances.com/deals')));
 assert.equal(feedDeals([{id:'x',title:'Product',sku,retailer:'home_depot',kind:'in_store',locked:false}])[0].dealContent,'');
});
