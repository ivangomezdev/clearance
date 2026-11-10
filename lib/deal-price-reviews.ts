import type {OfferPrice} from './offer-price.ts';

// Hold a reported claim for review while the source still publishes that amount.
// A customer report is not a verified replacement price at the retailer.
const reports: Record<string, {amount: number; reason: string}> = {
  '7e703e84-a900-4392-9e2d-05b3e6170b12': {
    amount: 140,
    reason: 'Se reportó un precio distinto al anunciado en Lowe’s. Esta publicación está pendiente de comprobación.',
  },
};

export function applyDealPriceReview(id: string, price: OfferPrice): OfferPrice {
  const report = reports[id];
  if (!report || price.amount === null || Math.abs(price.amount - report.amount) > .01) return price;
  const title = price.title.replace(/\$\s*\d+(?:,\d{3})*(?:\.\d{1,2})?/g, '').replace(/\s+/g, ' ').replace(/\s+(?:for|por|now|only|just|ahora|solo)\s*$/i, '').trim();
  return {...price, verification: 'reported_mismatch', review: true, amount: null, original: null, discount: null,
    reason: report.reason, title: title || 'Oferta con precio por confirmar'};
}
