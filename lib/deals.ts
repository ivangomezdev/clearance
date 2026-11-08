import {assessPrice, type OfferPrice} from './offer-price.ts';
export type Deal = { id: string; slug: string; title: string; headline?: string; dealContent?: string; retailer: string; category: string | null; dealLink?: string; sku?: string; imageUrl?: string; originalPrice: string | null; discountedPrice: string | null; discountOff: string | null; isActive: boolean; isTrending?: boolean; expiresAt?: string | null; createdAt: string; promoCode?: string | null; promoCodes?: (string | {code:string})[]; tags?: {slug:string;label:string}[]; source?:'discord'|'feed'; kind?:'in_store'; messageUrl?:string; channelName?:string; channelId?:string; messageId?:string };
export function price(value: unknown): number | null { if(value === null || value === undefined || value === '') return null; const n=Number(value); return Number.isFinite(n) && n>=0?n:null; }
const assessed = new WeakMap<Deal, OfferPrice>();
export function dealPrice(d: Deal) {
 let result=assessed.get(d);
 if(!result){result=assessPrice({title:d.title||'',headline:d.headline,description:(d.dealContent||'')+(d.promoCode||d.promoCodes?.length?' Coupon requerido':''),amount:d.discountedPrice,original:d.originalPrice,reportedDiscount:d.discountOff===null?undefined:Number(d.discountOff)*100});assessed.set(d,result);}
 return result;
}
export function discount(d: Deal) { return dealPrice(d).discount ?? 0; }
export function validatePage(requested:number,returned:number) {if(requested!==returned)throw new Error(`La API limita el historial a la página ${returned}: devolvió esa página al solicitar la ${requested}. Se detuvo la carga para evitar duplicados.`);}
export function expired(d:Deal) { return !d.isActive || !!(d.expiresAt && Date.parse(d.expiresAt)<Date.now()); }
export function safeUrl(value?:string|null) {try {const u=new URL(value||'');return u.protocol==='https:'||u.protocol==='http:'?u.href:null;}catch{return null;}}
export function retailerName(s:string) { const names:Record<string,string>={discord:'Discord',amazon:'Amazon',best_buy:'Best Buy',home_depot:'Home Depot',lowes:"Lowe’s",walmart:'Walmart',woot:'Woot',target:'Target',costco:'Costco',app:'App / enlace externo',amazon_business:'Amazon Business'};return names[s]||s.split('_').map(t=>t.charAt(0).toUpperCase()+t.slice(1)).join(' '); }
export function sourceUrl(d:Deal) { if(d.source==='discord')return safeUrl(d.messageUrl)||'https://discord.com/invite/profitcentral';if(d.source==='feed'&&!d.slug)return 'https://www.hiddenclearances.com/deals/in-store';const store=d.retailer.replace(/_/g,'-');return `https://www.hiddenclearances.com/${encodeURIComponent(store)}/deals/${encodeURIComponent(d.slug)}`; }
