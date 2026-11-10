import {storeHasStock, type StockResults} from './store-stock.ts';
import {STOCK_CACHE_AGE} from './store-availability-client.ts';

type PriceRange = {min: number; max: number} | null;
const range = (values: number[]): PriceRange => values.length ? {min: Math.min(...values), max: Math.max(...values)} : null;
const knownPrice = (price: number | null): price is number => price !== null && Number.isFinite(price) && price > 0;

export function summarizeStorePrice(published: number | null, result: StockResults | null, now = Date.now()) {
  const empty = {available: 0, prices: null as PriceRange, unavailablePrices: null as PriceRange, unpriced: 0, publishedAvailable: false};
  if (!result) return {status: 'unqueried' as const, ...empty};
  const age = now - Date.parse(result.checkedAt);
  if (!Number.isFinite(age) || age < 0 || age >= STOCK_CACHE_AGE) return {status: 'stale' as const, ...empty};
  const available = result.stores.filter(storeHasStock);
  const prices = available.map(store => store.price).filter(knownPrice);
  return {
    status: available.length ? 'available' as const : 'unavailable' as const,
    available: available.length, prices: range(prices),
    unavailablePrices: range(result.stores.filter(store => !storeHasStock(store)).map(store => store.price).filter(knownPrice)),
    unpriced: available.length - prices.length,
    publishedAvailable: published !== null && prices.some(price => Math.abs(price - published) < .011),
  };
}
