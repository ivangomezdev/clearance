import {hcSessionForRequest, type HcSession} from './hc-session-service.ts';
import {parseHomeDepotStockResponse, validHomeDepotSku, validZip} from './store-stock.ts';

const headers = {'Cache-Control': 'private, no-store'};
export async function stockResponse(request: Request, sessionForRequest: (request: Request) => Promise<HcSession> = hcSessionForRequest, fetcher: typeof fetch = fetch) {
  const params = new URL(request.url).searchParams;
  const sku = params.get('sku') || '', zip = params.get('zip') || '';
  if (!validHomeDepotSku(sku) || !validZip(zip)) return Response.json({error: 'Introduce un código postal de 5 dígitos y un producto válido.'}, {status: 400, headers});
  let session: HcSession;
  try {session = await sessionForRequest(request);} catch {
    return Response.json({error: 'No se pudo consultar la conexión de inventario. Inténtalo de nuevo.', code: 'INVENTORY_TEMPORARY_UNAVAILABLE'}, {status: 503, headers});
  }
  if (!session.token) return session.apply(Response.json({
    error: session.info.renewalError ? 'El servicio de inventario no está disponible temporalmente. Inténtalo de nuevo.' : 'La conexión de inventario necesita restablecerse. Tu código postal se conserva.',
    code: session.info.renewalError ? 'INVENTORY_TEMPORARY_UNAVAILABLE' : 'INVENTORY_CONNECTION_REQUIRED',
  }, {status: 503, headers}));
  try {
    const send = () => fetcher(`https://api.hiddenclearances.com/api/v1/homedepot/stock?sku=${encodeURIComponent(sku)}&zip=${encodeURIComponent(zip)}`, {
      headers: {Accept: 'application/json', Authorization: `Bearer ${session.token!}`}, signal: AbortSignal.timeout(120000), cache: 'no-store', redirect: 'error',
    });
    let response = await send();
    if (response.status === 401 && await session.refresh()) response = await send();
    if (!response.ok) {
      const code = response.status === 401 ? 'INVENTORY_CONNECTION_REQUIRED' : response.status === 403 ? 'INVENTORY_ACCESS_DENIED' : response.status === 429 ? 'INVENTORY_RATE_LIMITED' : 'INVENTORY_TEMPORARY_UNAVAILABLE';
      const error = response.status === 401 ? 'La conexión de inventario necesita restablecerse. Tu código postal se conserva.'
        : response.status === 403 ? 'La consulta no está disponible para esta cuenta de inventario.'
        : response.status === 429 ? 'Se alcanzó el límite de consultas. Espera antes de volver a buscar.'
        : 'No se pudo consultar el inventario. Inténtalo de nuevo.';
      const retry = response.headers.get('retry-after');
      return session.apply(Response.json({error, code}, {status: response.status === 401 ? 503 : response.status, headers: {...headers, ...(retry ? {'Retry-After': retry} : {})}}));
    }
    return session.apply(Response.json({data: parseHomeDepotStockResponse(await response.json(), sku, zip)}, {headers}));
  } catch {
    return session.apply(Response.json({error: 'La consulta tardó demasiado o devolvió datos no válidos. Inténtalo de nuevo.', code: 'INVENTORY_TEMPORARY_UNAVAILABLE'}, {status: 502, headers}));
  }
}
