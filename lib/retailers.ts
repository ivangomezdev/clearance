// Keep the main stores in a predictable order, even before their first offer arrives.
export const QUICK_RETAILERS = ['home_depot', 'walmart', 'amazon', 'woot', 'target', 'discord'] as const;
const RETAILERS = [...QUICK_RETAILERS, 'best_buy', 'lowes', 'costco', 'amazon_business'];

export function retailerOptions(deals: ReadonlyArray<{retailer: string}>): [string, number][] {
  const counts = new Map<string, number>(RETAILERS.map(store => [store, 0]));
  for (const deal of deals) counts.set(deal.retailer, (counts.get(deal.retailer) || 0) + 1);
  const known = new Set<string>(RETAILERS);
  const others = [...counts.keys()].filter(store => !known.has(store)).sort();
  return [...RETAILERS, ...others].map(store => [store, counts.get(store) || 0]);
}
