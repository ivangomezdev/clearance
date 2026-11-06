import {hcSessionForRequest} from '../../../lib/hc-session-service';
import {normalizeHomeDepotStock, validHomeDepotSku, validZip} from '../../../lib/store-stock';

const headers = {'Cache-Control': 'private, no-store'};
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const sku = params.get('sku') || '', zip = params.get('zip') || '';
  if (!validHomeDepotSku(sku) || !validZip(zip)) {
    return Response.json({error: 'Introduce un ZIP de 5 dígitos y un producto de Home Depot válido.'}, {status: 400, headers});
  }
  const session = await hcSessionForRequest(request);
  if (!session.token) return session.apply(Response.json({error: 'Conecta tu sesión de Hidden Clearances para consultar tiendas.', session: session.info}, {status: 401, headers}));
  try {
    const send = () => fetch(`https://api.hiddenclearances.com/api/v1/homedepot/stock?sku=${encodeURIComponent(sku)}&zip=${encodeURIComponent(zip)}`, {
      headers: {Accept: 'application/json', Authorization: `Bearer ${session.token!}`},
      signal: AbortSignal.timeout(120000), cache: 'no-store', redirect: 'error',
    });
    let response = await send();
    if (response.status === 401 && await session.refresh()) response = await send();
    if (!response.ok) {
      const error = response.status === 401 ? 'La sesión fue revocada o no pudo renovarse. Conecta de nuevo Hidden Clearances.'
        : response.status === 403 ? 'La cuenta de Hidden Clearances no tiene acceso a esta consulta.'
        : response.status === 429 ? 'Se alcanzó el límite de consultas. Espera antes de volver a buscar.'
        : 'No se pudo consultar el inventario de las tiendas. Vuelve a intentar.';
      const retry = response.headers.get('retry-after');
      return session.apply(Response.json({error}, {status: response.status, headers: {...headers, ...(retry ? {'Retry-After': retry} : {})}}));
    }
    const body = await response.json();
    if (!body || typeof body !== 'object' || !('data' in body) || ('success' in body && body.success === false)) throw Error('Consulta rechazada por la fuente.');
    return session.apply(Response.json({data: normalizeHomeDepotStock(body.data, sku, zip)}, {headers}));
  } catch {
    return session.apply(Response.json({error: 'La consulta tardó demasiado o devolvió datos no válidos. Vuelve a intentar.'}, {status: 502, headers}));
  }
}
