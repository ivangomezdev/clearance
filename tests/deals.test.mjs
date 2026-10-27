import test from 'node:test';
import assert from 'node:assert/strict';
import {price,discount,expired,safeUrl} from '../lib/deals.ts';
test('missing prices remain unknown while zero is free',()=>{assert.equal(price(null),null);assert.equal(price(''),null);assert.equal(price('abc'),null);assert.equal(price('0'),0)});
test('real price reduction and fallback fractional discount',()=>{assert.equal(discount({originalPrice:'350',discountedPrice:'64'}),82);assert.equal(discount({originalPrice:'10',discountedPrice:'0'}),100);assert.equal(discount({originalPrice:null,discountedPrice:null,discountOff:'0.455'}),46)});
test('inactive or expired offers are not marked live',()=>{assert.equal(expired({isActive:false}),true);assert.equal(expired({isActive:true,expiresAt:'2020-01-01'}),true);assert.equal(expired({isActive:true,expiresAt:null}),false)});
test('untrusted links cannot use executable or local schemes',()=>{assert.equal(safeUrl('javascript:alert(1)'),null);assert.equal(safeUrl('file:///C:/secret'),null);assert.equal(safeUrl('https://example.com/go?tag=abc'),'https://example.com/go?tag=abc')});
