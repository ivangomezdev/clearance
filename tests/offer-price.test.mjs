import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPrice,priceSummary} from '../lib/offer-price.ts';
import {dealPrice,discount} from '../lib/deals.ts';

const atkins={title:'Atkins Chocolate Banana High Protein Shake, 15g Pr',headline:'$1 ATKINS PROTEIN SHAKE AT AMAZON',description:'$1 ATKINS PROTEIN SHAKE AT AMAZON\n\nMake sure to clip sub & save coupon (YMMV)\n\nComes out to $13 for pack of 12 (Orig. $26)\n\nSame pack at Walmart was $26 & sold out',amount:'1.00',original:'26.00',reportedDiscount:96.2};
test('Atkins regression: package total replaces rounded unit claim, discounts use the same basis',()=>{
 const p=assessPrice(atkins);
 assert.equal(p.review,false);assert.equal(p.clarified,true);assert.equal(p.amount,13);assert.equal(p.quantity,12);assert.equal(p.unitPrice,1.08);assert.equal(p.discount,50);
 assert.equal(p.title,atkins.title);assert.ok(!p.title.includes('$1'));
 assert.deepEqual(p.conditions,['Requiere cupón','Requiere suscripción','Puede variar según tu cuenta']);
 assert.ok(priceSummary(p).some(s=>s.includes('sin verificar')));
 const d={title:atkins.title,headline:atkins.headline,dealContent:atkins.description,discountedPrice:'1.00',originalPrice:'26.00',discountOff:'.962'};
 assert.equal(dealPrice(d).amount,13);assert.equal(discount(d),50);assert.equal(d.discountedPrice,'1.00');
});
test('does not replace precise package prices with rounded description claims',()=>{
 const p=assessPrice({...atkins,headline:'$1 EACH ATKINS PROTEIN SHAKES',amount:13.52,description:'Subscribe & Save + clip the coupon on the page, only $13 for 12 pack'});
 assert.equal(p.amount,13.52);assert.equal(p.quantity,12);assert.equal(p.clarified,false);assert.equal(p.discount,48);
});
test('ambiguous package totals remain unpriced instead of guessing',()=>{
 for(const description of ['Comes out to $13 for pack of 12\nNow $20 for pack of 12','Only $13 for pack of 12']){
  const p=assessPrice({...atkins,amount:5,description});assert.equal(p.review,true);assert.equal(p.amount,null);assert.equal(p.discount,null);assert.equal(p.original,null);
 }
 assert.equal(assessPrice({...atkins,amount:0,description:'Only $2 for pack of 12'}).review,true);
});
test('unit-only claims need a total; competitor and historical prices are not totals',()=>{
 for(const description of ['Other stores sell for $13 for pack of 12','Was $13 for pack of 12','Same pack at Walmart was $26 & sold out','']){
  const p=assessPrice({...atkins,headline:'$1 EACH ATKINS PROTEIN SHAKE',description});assert.equal(p.review,true);assert.equal(p.amount,null);
 }
});
test('distinguishes sale prices, original prices and savings in titles',()=>{
 for(const title of ['$190 SHOES FOR $105','$190 OFF SHOES NOW $105','$260 JACKET JUST $105','$20 OFF HEADPHONES']){
  const p=assessPrice({title,amount:105,original:190});assert.equal(p.review,false);assert.equal(p.amount,105);
 }
 const p=assessPrice({title:'$25 HEADPHONES',amount:1,original:50});assert.equal(p.review,true);assert.equal(p.discount,null);
});
test('a known pack count and matching unit claim do not hide a consistent total',()=>{
 const p=assessPrice({title:'24CT GU ENERGY GELS VARIETY PACK FOR ¢76 EACH',amount:18.40,original:30});
 assert.equal(p.review,false);assert.equal(p.amount,18.40);assert.equal(p.quantity,24);assert.equal(p.unitPrice,.77);
 const missing=assessPrice({title:'12 PACK DRINKS $1 EACH',amount:1,original:30});
 assert.equal(missing.review,true);assert.equal(missing.amount,null);
});
test('clip products and explicit no-coupon descriptions do not invent a coupon condition',()=>{
 assert.deepEqual(assessPrice({title:'Hair clip',description:'No coupon required',amount:5,original:10}).conditions,[]);
});
test('unknown and invalid prices have no discount, zero remains conditional',()=>{
 for(const value of [null,'',NaN,true,-1]){
  const p=assessPrice({title:'Product',amount:value,original:50,reportedDiscount:98});assert.equal(p.review,true);assert.equal(p.amount,null);assert.equal(p.discount,null);
 }
 assert.equal(assessPrice({title:'Product',amount:0,original:10}).amount,0);
 assert.equal(assessPrice({title:'Product',amount:20,original:10}).review,true);
});
test('conditions are surfaced without changing a consistent published total',()=>{
 const p=assessPrice({title:'Coffee',description:'Clip coupon, Subscribe & Save. YMMV. With Prime. $5 cashback.',amount:15,original:30});
 assert.equal(p.amount,15);assert.equal(p.discount,50);assert.equal(p.review,false);assert.equal(p.conditions.length,5);
});
