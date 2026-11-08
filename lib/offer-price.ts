export type PriceInput = {
  title: string;
  headline?: string;
  description?: string;
  amount: unknown;
  original: unknown;
  reportedDiscount?: number;
};
export type OfferPrice = {
  amount: number | null;
  original: number | null;
  discount: number | null;
  quantity: number | null;
  unitPrice: number | null;
  conditions: string[];
  review: boolean;
  clarified: boolean;
  reason: string | null;
  title: string;
};

const dollars = String.raw`(\d+(?:,\d{3})*(?:\.\d{1,2})?)`;
function amount(value: unknown) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const parse = (s: string) => Number(s.replaceAll(',', ''));
const differs = (a: number, b: number) => Math.abs(a - b) > Math.max(.05, Math.max(a, b) * .05);
const currency = (n: number) => new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(n);

// These are source claims, never a verification of the retailer's current price.
export function assessPrice(input: PriceInput): OfferPrice {
  const text = `${input.title}\n${input.headline || ''}\n${input.description || ''}`;
  const conditions: string[] = [];
  const couponText = text.replace(/\b(?:no|without)\s+coupons?(?:\s+(?:needed|required))?/gi, '');
  if (/\bcoupon\b|\bcup[oó]n\b|\bpromo\s*code\b/i.test(couponText)) conditions.push('Requiere cupón');
  if (/\bsub(?:scribe)?\s*(?:&|and|\+|n)\s*save\b|\bs&s\b|suscripci[oó]n/i.test(text)) conditions.push('Requiere suscripción');
  if (/\bYMMV\b|select(?:ed)? accounts|cuentas seleccionadas/i.test(text)) conditions.push('Puede variar según tu cuenta');
  if (/\bprime\s+(?:only|members)|\bwith prime\b|\bw\/\s*prime\b|\bmembers?\s+only\b/i.test(text)) conditions.push('Requiere membresía');
  if (/\bcash\s*back\b|\brebate\b|\breembolso\b/i.test(text)) conditions.push('Incluye reembolso posterior');

  let sale = amount(input.amount);
  const original = amount(input.original);
  let quantity: number | null = null;
  let clarified = false;
  let reason: string | null = null;
  const packClaims: {total: number; count: number}[] = [];
  // Accept only explicit purchase totals at the start of a line. Do not turn a
  // competitor's price, a saving, or an arbitrary dollar amount into the total.
  for (const line of (input.description || '').split(/\r?\n/)) {
    let clean = line.trim();
    if (/^(?:subscribe\s*(?:&|and)\s*save|clip\b)/i.test(clean)) {
      clean = clean.split(/[,;]\s*(?=(?:only|now|pay|comes out to)\s*\$)/i).at(-1)!;
    }
    const a = clean.match(new RegExp(String.raw`^(?:(?:comes? out to|only|now|pay|total(?: price)?(?: is)?|solo|ahora)\s*)?\$\s*${dollars}\s+(?:for|por)\s+(?:a\s+)?(?:pack|paquete|case|box)\s*(?:of|de)?\s*(\d+)\b`, 'i'));
    const b = clean.match(new RegExp(String.raw`^(?:(?:comes? out to|only|now|pay|solo|ahora)\s*)?\$\s*${dollars}\s+(?:for|por)\s+(\d+)\s*[- ]?(?:pack|paquete|count)\b`, 'i'));
    const c = clean.match(new RegExp(String.raw`^(?:pack|paquete|case|box)\s+(?:of|de)\s+(\d+)\s+(?:for|por|now|only)\s*\$\s*${dollars}\b`, 'i'));
    const m = a || b;
    const total = m ? parse(m[1]) : c ? parse(c[2]) : null;
    const count = m ? Number(m[2]) : c ? Number(c[1]) : null;
    if (total !== null && count !== null && count > 1 && count <= 1000) packClaims.push({total, count});
  }
  if (packClaims.length) {
    const first = packClaims[0];
    if (packClaims.some(p => differs(p.total, first.total) || p.count !== first.count)) reason = 'La publicación indica distintos totales de paquete.';
    else {
      quantity = first.count;
      if (sale === null || differs(sale, first.total)) {
        // A smaller value is safe to reinterpret only when it agrees with the
        // unit price (including headlines rounded down to whole dollars).
        const unit = first.total / first.count;
        if (sale !== null && sale > 0 && sale < first.total && (Math.abs(sale - unit) <= .05 || (Number.isInteger(sale) && sale === Math.floor(unit)))) {
          sale = first.total;
          clarified = true;
        } else reason = 'El precio recibido no coincide con el total del paquete en la descripción.';
      }
    }
  }

  const headline = input.headline || input.title;
  const unitClaim = /\beach\b|per\s+(?:unit|bottle|item)|por\s+unidad/i.test(headline);
  if (!quantity && unitClaim && sale !== null) {
    const count = headline.match(/\b(\d+)\s*[- ]?(?:ct|count|pack|pk)\b/i) || headline.match(/\b(?:pack|case|box)\s+of\s+(\d+)\b/i);
    const usd = headline.match(new RegExp(String.raw`\$\s*${dollars}\s*(?:each|per\s+(?:unit|bottle|item)|por\s+unidad)\b`, 'i'));
    const cents = headline.match(/(?:¢\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:¢|cents?))\s*each\b/i);
    const unit = usd ? parse(usd[1]) : cents ? Number(cents[1] || cents[2]) / 100 : null;
    const n = count ? Number(count[1]) : 0;
    if (n > 1 && n <= 1000 && unit !== null && sale > unit && Math.abs(sale / n - unit) <= .05) quantity = n;
  }
  if (!quantity && unitClaim) reason = 'Se anuncia un precio por unidad sin un total de compra claro.';
  if (!quantity && !unitClaim) {
    // Prefer an explicit final price over a leading original price, e.g.
    // "$190 shoes for $105". "$20 OFF" is a saving, not a purchase price.
    const final = headline.match(new RegExp(String.raw`\b(?:now|only|for|just|as low as|ahora|solo)\s*\$\s*${dollars}(?![\d.])`, 'i'));
    const leading = headline.match(new RegExp(String.raw`^\s*\$\s*${dollars}(?![\d.])(?!\s*(?:off|de descuento|cashback|cash back|rebate)\b)`, 'i'));
    const claim = final || leading;
    if (sale !== null && claim && differs(sale, parse(claim[1]))) reason = 'El precio del título no coincide con el precio recibido.';
  }
  if (sale === null) reason ||= 'La fuente no indica un precio válido.';
  if (sale !== null && original !== null && sale > original) reason ||= 'El precio de oferta supera el precio original informado.';
  const review = reason !== null;
  const reliableOriginal = !review && original !== null && original > (sale ?? Infinity) ? original : null;
  const discount = review ? null : reliableOriginal && sale !== null
    ? Math.round((reliableOriginal - sale) * 100 / reliableOriginal)
    : clarified ? null : input.reportedDiscount != null && Number.isFinite(input.reportedDiscount)
      ? Math.max(0, Math.min(100, Math.round(input.reportedDiscount))) : null;
  // Keep the raw headline in the source object; the card must not repeat the
  // misleading $1 after clarifying the package total.
  const title = clarified || review || (quantity !== null && /\$\s*\d/.test(headline))
    ? input.title.replace(/\$\s*\d+(?:,\d{3})*(?:\.\d{1,2})?/g, '').replace(/\s+/g, ' ').trim() || 'Oferta: consultar condiciones'
    : headline;
  return {amount: review ? null : sale, original: reliableOriginal, discount, quantity,
    unitPrice: !review && quantity && sale !== null ? Math.round(sale / quantity * 100) / 100 : null,
    conditions, review, clarified, reason, title};
}

export function priceSummary(p: OfferPrice): string[] {
  return [
    ...(p.review ? ['Precio por confirmar', p.reason!] : p.quantity ? [`Total por ${p.quantity} unidades · según publicación`, `≈ ${currency(p.unitPrice!)} por unidad`] : []),
    ...p.conditions,
    ...(p.clarified ? ['Total aclarado con la descripción; sin verificar en la tienda.'] : []),
  ];
}
