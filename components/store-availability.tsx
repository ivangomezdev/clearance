'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {ArrowUpRight, MapPin, RefreshCw} from 'lucide-react';
import {validHomeDepotSku, validZip} from '../lib/store-stock';
import type {StockResults} from '../lib/store-stock';
import {browserStorage, cacheStock, cachedStock, lookupStock, rememberZip, rememberedZip, rememberStockCooldown, stockCooldown, StockLookupError} from '../lib/store-availability-client';

export function StoreAvailability({sku}: {sku?: string}) {
  const [zip, setZip] = useState('');
  const [result, setResult] = useState<StockResults | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false), [retryAt, setRetryAt] = useState(0);
  const [cooldown, setCooldown] = useState(0), [canManage, setCanManage] = useState(false);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const consult = useCallback(async (postalCode: string, force = false) => {
    if (!sku || !validHomeDepotSku(sku) || !validZip(postalCode)) return;
    if (busy.current) return;
    // Remember the valid input before the request, including when the service is
    // unavailable. Returning to the product never asks for the same ZIP again.
    rememberZip(browserStorage('localStorage'), postalCode);
    if (!force) {
      const saved = cachedStock(browserStorage('sessionStorage'), sku, postalCode);
      if (saved) {setResult(saved); setError(''); return;}
    }
    const until = Math.max(retryAt, stockCooldown(browserStorage('sessionStorage')));
    if (Date.now() < until) {setRetryAt(until); setError('Espera antes de volver a consultar. Tu código postal se conserva.'); return;}
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    busy.current = true; setLoading(true); setError(''); setCanManage(false);
    try {
      const data = await lookupStock(sku, postalCode, controller.signal);
      if (controller.signal.aborted) return;
      cacheStock(browserStorage('sessionStorage'), data); setResult(data);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'No se pudo consultar la disponibilidad.');
      if (e instanceof StockLookupError) {
        setRetryAt(e.retryAt); rememberStockCooldown(browserStorage('sessionStorage'), e.retryAt);
        if (e.connectionRequired) {
          try {const r = await fetch('/api/hc-session', {signal: controller.signal, cache: 'no-store'}); const state = await r.json() as {canManage?: boolean}; if (!controller.signal.aborted) setCanManage(state.canManage === true);} catch {}
        }
      }
    } finally {if (request.current === controller) {busy.current = false; if (!controller.signal.aborted) setLoading(false);}}
  }, [sku, retryAt]);
  // retryAt must not restart an automatic lookup after a 429 response.
  const initialConsult = useRef(consult); initialConsult.current = consult;
  useEffect(() => {
    const saved = rememberedZip(browserStorage('localStorage'));
    setZip(saved); setResult(null); setError(''); setShowEmpty(false);
    if (saved) void initialConsult.current(saved);
    return () => {request.current?.abort(); busy.current = false;};
  }, [sku]);
  useEffect(() => {
    const refresh = () => setCooldown(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    refresh(); if (retryAt <= Date.now()) return;
    const timer = setInterval(refresh, 1000); return () => clearInterval(timer);
  }, [retryAt]);
  if (!sku || !validHomeDepotSku(sku)) return <p className="buy-note">No hay un número de producto disponible para buscar tiendas.</p>;
  const stores = result?.stores.filter(store => showEmpty || store.inStock) || [];
  const available = result?.stores.filter(store => store.inStock).length || 0;
  return <section className="store-availability" aria-label="Disponibilidad por tienda">
    <h3><MapPin size={17}/> Encuéntralo en Home Depot</h3>
    <form onSubmit={event => {event.preventDefault(); if (!validZip(zip)) {setError('Introduce un código postal de Estados Unidos de 5 dígitos.'); return;} void consult(zip, !!result);}}>
      <label htmlFor="stock-zip">Código postal de Estados Unidos (ZIP)</label>
      <div className="stock-search"><input id="stock-zip" value={zip} inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}" maxLength={5} placeholder="Ej. 33101" required disabled={loading} onChange={event => {setZip(event.target.value.replace(/\D/g, '').slice(0, 5)); setResult(null); setError('');}}/>
        <button className="primary" disabled={loading || cooldown > 0}>{loading ? <><RefreshCw size={15} className="spin"/> Consultando…</> : cooldown > 0 ? `Espera ${cooldown} s` : result ? 'Actualizar tiendas' : 'Buscar tiendas'}</button></div>
    </form>
    {loading && <p role="status" className="buy-note">Consultando inventario cercano. Puede tardar hasta dos minutos.</p>}
    {error && <p className="redirect-warning" role="alert">{error}</p>}
    {canManage && <a className="inventory-reconnect" href="/settings/inventory" target="_blank" rel="noopener noreferrer">Restablecer conexión de inventario <ArrowUpRight size={14}/></a>}
    {result && <div className="stock-results" aria-live="polite">
      <p>{available} {available === 1 ? 'tienda con existencias' : 'tiendas con existencias'} cerca de {result.zip}</p>
      <p className="buy-note">Consultado: {new Date(result.checkedAt).toLocaleString('es-MX', {timeZone: 'America/Cancun', dateStyle: 'short', timeStyle: 'short'})}. Puedes actualizar antes de salir.</p>
      <label className="stock-empty-toggle"><input type="checkbox" checked={showEmpty} onChange={event => setShowEmpty(event.target.checked)}/> Mostrar tiendas sin existencias</label>
      {stores.length === 0 && <p className="buy-note">{result.stores.length ? 'No se encontraron existencias en las tiendas consultadas para este código postal.' : 'No se recibieron tiendas para este código postal.'}</p>}
      <div className="stock-store-list">{stores.map(store => <article className="stock-store" key={store.storeId}>
        <div className="stock-store-heading"><strong>{store.name}</strong>{store.price !== null && <strong>{new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(store.price)}</strong>}</div>
        <p>{store.address || `Sucursal ${store.storeId}`}</p>
        <p>{store.distance !== null && `${store.distance.toFixed(1)} mi · `}{store.inStock ? store.quantity !== null ? `${store.quantity} en existencia` : 'Con existencias' : 'Sin existencias'}{store.itemLocation && ` · ${store.itemLocation}`}</p>
        <a href={store.productUrl} target="_blank" rel="noopener noreferrer">Ver producto en esta tienda <ArrowUpRight size={15}/></a>
      </article>)}</div>
      <p className="buy-note">El producto se abre en otra pestaña; aquí se conservan tu código postal y la consulta. Precios y existencias finales en Home Depot.</p>
    </div>}
  </section>;
}
