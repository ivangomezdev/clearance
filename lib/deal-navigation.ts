import type {Deal} from './deals.ts';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const KEY = 'radar-open-offer:v1';
const optionalText = (v: unknown) => v === undefined || v === null || typeof v === 'string';
export function restoredDeal(storage: Store | undefined, now = Date.now()): Deal | null {
  try {
    const {deal: d, savedAt} = JSON.parse(storage?.getItem(KEY) || 'null') || {};
    if (!d || typeof savedAt !== 'number' || now < savedAt || now - savedAt > 30 * 60 * 1000 ||
      !['id', 'title', 'slug', 'retailer', 'createdAt'].every(k => typeof d[k] === 'string') ||
      !d.id || !d.title || !Number.isFinite(Date.parse(d.createdAt)) || typeof d.isActive !== 'boolean' ||
      ![d.headline, d.dealContent, d.originalPrice, d.discountedPrice, d.discountOff, d.imageUrl, d.dealLink, d.sku, d.expiresAt, d.promoCode].every(optionalText) ||
      (d.source !== undefined && !['feed', 'discord'].includes(d.source)) ||
      (d.tags !== undefined && (!Array.isArray(d.tags) || !d.tags.every((t: {slug?: unknown; label?: unknown}) => t && typeof t.slug === 'string' && typeof t.label === 'string'))) ||
      (d.promoCodes !== undefined && (!Array.isArray(d.promoCodes) || !d.promoCodes.every((c: unknown) => typeof c === 'string' || (!!c && typeof c === 'object' && 'code' in c && typeof c.code === 'string'))))) return null;
    return d as Deal;
  } catch {return null;}
}
export function rememberOpenDeal(storage: Store | undefined, deal: Deal | null, now = Date.now()) {
  try {if (deal) storage?.setItem(KEY, JSON.stringify({deal, savedAt: now})); else storage?.removeItem(KEY);} catch {}
}
