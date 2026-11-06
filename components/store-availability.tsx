'use client';

import {useEffect, useRef, useState} from 'react';
import {ArrowUpRight, MapPin, RefreshCw} from 'lucide-react';
import {validHomeDepotSku, validZip} from '../lib/store-stock';
import type {StockResults} from '../lib/store-stock';

export function StoreAvailability({sku}: {sku?: string}) {
  const [zip, setZip] = useState('');
  const [result, setResult] = useState<StockResults | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false), [retryAt, setRetryAt] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    try { const saved = localStorage.getItem('radar-store-zip'); if (saved && validZip(saved)) setZip(saved); } catch {}
    return () => request.current?.abort();
  }, []);
  useEffect(() => {
    const refresh = () => setCooldown(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    refresh(); if (retryAt <= Date.now()) return;
    const timer = setInterval(refresh, 1000); return () => clearInterval(timer);
  }, [retryAt]);
  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current || Date.now() < retryAt) return;
    if (!validZip(zip)) { setError('Introduce un ZIP de Estados Unidos de 5 dígitos.'); return; }
    if (!sku || !validHomeDepotSku(sku)) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    busy.current = true; setLoading(true); setError(''); setResult(null); setShowEmpty(false);
    try {
      const response = await fetch(`/api/stock?sku=${encodeURIComponent(sku)}&zip=${encodeURIComponent(zip)}`, {signal: controller.signal});
      const body = await response.json() as {data?: StockResults; error?: string};
      if (controller.signal.aborted) return;
      if (response.status === 429) {
        const value = response.headers.get('retry-after');
        const seconds = value ? (Number.isFinite(Number(value)) ? Number(value) : (Date.parse(value) - Date.now()) / 1000) : 65;
        setRetryAt(Date.now() + Math.max(65, Number.isFinite(seconds) ? seconds : 65) * 1000);
      }
      if (!response.ok || !body.data) throw Error(body.error || 'No se pudo consultar la disponibilidad.');
      setResult(body.data);
      try { localStorage.setItem('radar-store-zip', zip); } catch {}
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudo consultar la disponibilidad.');
    } finally { if (request.current === controller) { busy.current = false; if (!controller.signal.aborted) setLoading(false); } }
  }
  if (!sku || !validHomeDepotSku(sku)) return <p className="buy-note">La fuente no incluye el número de producto necesario para buscar tiendas. Consulta la publicación original.</p>;
  const stores = result?.stores.filter(store => showEmpty || store.inStock) || [];
  const available = result?.stores.filter(store => store.inStock).length || 0;
  return <section className="store-availability" aria-label="Disponibilidad por tienda">
    <h3><MapPin size={17}/> Encuéntralo en Home Depot</h3>
    <form onSubmit={search}>
      <label htmlFor="stock-zip">ZIP de Estados Unidos</label>
      <div className="stock-search"><input id="stock-zip" value={zip} inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}" maxLength={5} placeholder="Ej. 33101" required disabled={loading} onChange={event => {setZip(event.target.value.replace(/\D/g, '').slice(0, 5)); setResult(null); setError('');}}/>
        <button className="primary" disabled={loading || cooldown > 0}>{loading ? <><RefreshCw size={15} className="spin"/> Consultando…</> : cooldown > 0 ? `Espera ${cooldown} s` : 'Buscar tiendas'}</button></div>
    </form>
    {loading && <p role="status" className="buy-note">Consultando inventario cercano. Puede tardar hasta dos minutos.</p>}
    {error && <p className="redirect-warning" role="alert">{error}</p>}
    {result && <div className="stock-results" aria-live="polite">
      <p>{available} {available === 1 ? 'tienda con existencias' : 'tiendas con existencias'} cerca de {result.zip}</p>
      <label className="stock-empty-toggle"><input type="checkbox" checked={showEmpty} onChange={event => setShowEmpty(event.target.checked)}/> Mostrar tiendas sin existencias</label>
      {stores.length === 0 && <p className="buy-note">{result.stores.length ? 'No se encontraron existencias en las tiendas consultadas para este ZIP.' : 'La fuente no devolvió tiendas para este ZIP.'}</p>}
      <div className="stock-store-list">{stores.map(store => <article className="stock-store" key={store.storeId}>
        <div className="stock-store-heading"><strong>{store.name}</strong>{store.price !== null && <strong>{new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(store.price)}</strong>}</div>
        <p>{store.address || `Sucursal ${store.storeId}`}</p>
        <p>{store.distance !== null && `${store.distance.toFixed(1)} mi · `}{store.inStock ? store.quantity !== null ? `${store.quantity} en existencia` : 'Con existencias' : 'Sin existencias'}{store.itemLocation && ` · ${store.itemLocation}`}</p>
        <a href={store.productUrl} target="_blank" rel="noopener noreferrer">Ver producto en esta tienda <ArrowUpRight size={15}/></a>
      </article>)}</div>
      <p className="buy-note">Ordenadas por cercanía, con existencias primero. Precios en USD. Home Depot confirma el precio y la disponibilidad final.</p>
    </div>}
  </section>;
}
