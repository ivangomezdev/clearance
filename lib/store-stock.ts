export type StoreStock = {
  storeId: string;
  name: string;
  address: string;
  distance: number | null;
  inStock: boolean;
  quantity: number | null;
  price: number | null;
  itemLocation: string | null;
  productUrl: string;
};
export type StockResults = {sku: string; zip: string; stores: StoreStock[]; checkedAt: string};
export function storeHasStock(store: StoreStock) {return store.inStock && store.quantity !== 0;}

export function validZip(value: string) { return /^\d{5}$/.test(value); }
export function validHomeDepotSku(value: string) { return /^\d{9}$/.test(value); }

export function homeDepotStoreUrl(sku: string, storeId: string): string | null {
  if (!validHomeDepotSku(sku) || !/^\d{1,4}$/.test(storeId)) return null;
  const url = new URL(`https://www.homedepot.com/p/${sku}`);
  url.searchParams.set('store', storeId.padStart(4, '0'));
  return url.href;
}

function numeric(value: unknown): number | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function text(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }

// Hidden Clearances' own clearanceGet client accepts both raw stock objects and
// {data: stock} envelopes. The stock route must preserve that same contract.
export function parseHomeDepotStockResponse(body: unknown, sku: string, zip: string): StockResults {
  if (!body || typeof body !== 'object' || ('success' in body && body.success === false)) throw Error('Consulta rechazada por la fuente.');
  return normalizeHomeDepotStock('data' in body && body.data !== undefined ? body.data : body, sku, zip);
}

// Stock objects use stores, inStock, totalStock/quantity and distance (miles).
export function normalizeHomeDepotStock(data: unknown, sku: string, zip: string): StockResults {
  if (!validHomeDepotSku(sku) || !validZip(zip)) throw Error('Producto o ZIP inválido.');
  if (!data || typeof data !== 'object' || !('stores' in data) || !Array.isArray(data.stores)) {
    throw Error('El formato de disponibilidad ha cambiado.');
  }
  const stores: StoreStock[] = [];
  const seen = new Set<string>();
  for (const raw of data.stores) {
    if (!raw || typeof raw !== 'object' || typeof raw.inStock !== 'boolean') continue;
    const id = typeof raw.storeId === 'number' ? String(raw.storeId) : text(raw.storeId);
    const url = homeDepotStoreUrl(sku, id);
    if (!url) continue;
    const storeId = id.padStart(4, '0');
    if (seen.has(storeId)) continue;
    seen.add(storeId);
    stores.push({
      storeId, name: text(raw.storeName) || `Home Depot ${storeId}`,
      address: [text(raw.address), [text(raw.city), text(raw.state), text(raw.zip)].filter(Boolean).join(', ')].filter(Boolean).join(', '),
      distance: numeric(raw.distance), inStock: raw.inStock === true,
      quantity: numeric(raw.totalStock) ?? numeric(raw.quantity), price: numeric(raw.price),
      itemLocation: text(raw.itemLocation) || null, productUrl: url,
    });
  }
  // Invalid rows must not look like a successful search with zero inventory.
  if (data.stores.length && !stores.length) throw Error('La API no devolvió tiendas válidas.');
  stores.sort((a, b) => Number(b.inStock) - Number(a.inStock) || (a.distance ?? Infinity) - (b.distance ?? Infinity));
  return {sku, zip, stores, checkedAt: new Date().toISOString()};
}
