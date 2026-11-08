import {homeDepotStoreUrl, validHomeDepotSku, validZip, type StockResults} from './store-stock.ts';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function browserStorage(kind: 'localStorage' | 'sessionStorage'): StorageLike | undefined {
  try {return typeof window === 'undefined' ? undefined : window[kind];} catch {return undefined;}
}
const ZIP_KEY = 'radar-store-zip';
const COOLDOWN_KEY = 'radar-stock:retry-until';
export const STOCK_CACHE_AGE = 5 * 60 * 1000;
const key = (sku: string, zip: string) => `radar-stock:v1:${sku}:${zip}`;

export function rememberedZip(storage?: StorageLike): string {
  try { const zip = storage?.getItem(ZIP_KEY) || ''; return validZip(zip) ? zip : ''; } catch { return ''; }
}
export function rememberZip(storage: StorageLike | undefined, zip: string) {
  if (!validZip(zip)) return;
  try { storage?.setItem(ZIP_KEY, zip); } catch {}
}
export function stockCooldown(storage: StorageLike | undefined, now = Date.now()): number {
  try {const until = Number(storage?.getItem(COOLDOWN_KEY)); return Number.isFinite(until) && until > now && until <= now + 86400000 ? until : 0;} catch {return 0;}
}
export function rememberStockCooldown(storage: StorageLike | undefined, until: number) {
  if (!Number.isFinite(until) || until <= Date.now()) return;
  try {storage?.setItem(COOLDOWN_KEY, String(until));} catch {}
}
export function validStockResult(value: unknown, sku: string, zip: string): value is StockResults {
  if (!value || typeof value !== 'object') return false;
  const d = value as StockResults;
  if (d.sku !== sku || d.zip !== zip || !validHomeDepotSku(sku) || !validZip(zip) ||
    !Number.isFinite(Date.parse(d.checkedAt)) || !Array.isArray(d.stores) || d.stores.length > 200) return false;
  const nullableNumber = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
  return d.stores.every(s => s && typeof s.storeId === 'string' && s.productUrl === homeDepotStoreUrl(sku, s.storeId) &&
    typeof s.name === 'string' && typeof s.address === 'string' && typeof s.inStock === 'boolean' &&
    nullableNumber(s.price) && nullableNumber(s.distance) && nullableNumber(s.quantity) && (s.itemLocation === null || typeof s.itemLocation === 'string'));
}
export function cachedStock(storage: StorageLike | undefined, sku: string, zip: string, now = Date.now()): StockResults | null {
  try {
    const value: unknown = JSON.parse(storage?.getItem(key(sku, zip)) || 'null');
    if (!validStockResult(value, sku, zip)) return null;
    const age = now - Date.parse(value.checkedAt);
    // Restoring a result must never make old inventory appear current.
    return age >= 0 && age < STOCK_CACHE_AGE ? value : null;
  } catch { return null; }
}
export function cacheStock(storage: StorageLike | undefined, result: StockResults) {
  if (!validStockResult(result, result.sku, result.zip)) return;
  try { storage?.setItem(key(result.sku, result.zip), JSON.stringify(result)); } catch {}
}

export class StockLookupError extends Error {
  readonly retryAt: number;
  readonly connectionRequired: boolean;
  constructor(message: string, retryAt = 0, connectionRequired = false) {
    super(message); this.retryAt = retryAt; this.connectionRequired = connectionRequired;
  }
}
export async function lookupStock(sku: string, zip: string, signal: AbortSignal, fetcher: typeof fetch = fetch, now = Date.now()): Promise<StockResults> {
  if (!validHomeDepotSku(sku) || !validZip(zip)) throw new StockLookupError('Introduce un código postal de Estados Unidos de 5 dígitos.');
  const response = await fetcher(`/api/stock?sku=${encodeURIComponent(sku)}&zip=${encodeURIComponent(zip)}`, {signal, cache: 'no-store', credentials: 'same-origin'});
  const body = await response.json() as {data?: StockResults; error?: string; code?: string};
  if (response.status === 429) {
    const raw = response.headers.get('retry-after');
    const seconds = raw ? (Number.isFinite(Number(raw)) ? Number(raw) : (Date.parse(raw) - now) / 1000) : 65;
    throw new StockLookupError('Espera antes de volver a consultar. Tu código postal se conserva.', now + Math.max(65, Number.isFinite(seconds) ? seconds : 65) * 1000);
  }
  const connectionRequired = body.code === 'INVENTORY_CONNECTION_REQUIRED' || response.status === 401;
  if (!response.ok || !validStockResult(body.data, sku, zip)) throw new StockLookupError(
    connectionRequired ? 'El inventario no está conectado en este momento. Tu código postal se conserva.' : body.error || 'No se pudo consultar la disponibilidad. Inténtalo de nuevo.', 0, connectionRequired);
  return body.data;
}
