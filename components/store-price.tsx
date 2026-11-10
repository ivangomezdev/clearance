'use client';

import {useEffect, useState} from 'react';
import type {OfferPrice} from '../lib/offer-price';
import type {StockResults} from '../lib/store-stock';
import {STOCK_CACHE_AGE} from '../lib/store-availability-client';
import {summarizeStorePrice} from '../lib/store-price';

const money = (price: number) => new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(price);
const range = (prices: {min: number; max: number}) => prices.min === prices.max ? money(prices.min) : `${money(prices.min)} – ${money(prices.max)}`;

export function StorePriceDisplay({value, result}: {value: OfferPrice; result: StockResults | null}) {
  const [, refresh] = useState(0);
  useEffect(() => {
    if (!result) return;
    const remaining = Date.parse(result.checkedAt) + STOCK_CACHE_AGE - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => refresh(value => value + 1), remaining + 20);
    return () => clearTimeout(timer);
  }, [result]);
  const published = value.scope === 'store' ? value.publishedAmount ?? null : value.amount;
  const summary = summarizeStorePrice(published, result);
  const confirmed = summary.status === 'available' && summary.prices;
  return <div className="local-offer-price" aria-live="polite">
    <p className="local-price-label">{confirmed ? `Precios reportados con existencias · ZIP ${result!.zip}` : 'Precio y disponibilidad por tienda'}</p>
    <div className={`detail-price${confirmed ? '' : ' local-price-status'}`}><strong>{confirmed ? range(summary.prices!) : summary.status === 'unavailable' ? `Sin existencias cerca de ${result!.zip}` : summary.status === 'stale' ? 'Actualiza la consulta de tiendas' : summary.status === 'available' ? 'Precio por confirmar en tienda' : 'Consulta tu ZIP para ver el precio'}</strong>{confirmed && <span>USD</span>}</div>
    {published !== null && <p className="published-price">Precio publicado: {money(published)} · referencia de la publicación</p>}
    {summary.status === 'unqueried' && <p className="local-price-note">El precio publicado puede corresponder a otra sucursal. Confirma el de tu zona antes de comprar.</p>}
    {summary.status === 'unavailable' && <p className="local-price-warning">No se encontró {published === null ? 'esta oferta' : `la oferta de ${money(published)}`} con existencias en las tiendas consultadas.{summary.unavailablePrices && ` Las tiendas sin existencias reportan ${range(summary.unavailablePrices)}.`}</p>}
    {summary.status === 'available' && published !== null && !summary.publishedAvailable && <p className="local-price-warning">Ninguna tienda con existencias consultada reportó el precio publicado de {money(published)}.</p>}
    {summary.unpriced > 0 && <p className="local-price-note">{summary.unpriced} {summary.unpriced === 1 ? 'tienda con existencias no informó precio' : 'tiendas con existencias no informaron precio'}.</p>}
    {summary.status === 'stale' && <p className="local-price-warning">La consulta anterior ya no se considera reciente. Actualiza precio y existencias.</p>}
  </div>;
}
