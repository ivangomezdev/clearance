import {clearHcSession, connectHcSession, hcSessionForRequest, sessionConnectionConfigured} from '../../../lib/hc-session-service';
import {allowedHcConnectionOrigin} from '../../../lib/hc-connection-origin';
import {isHcAdmin} from '../../../lib/hc-admin';
import {connectSharedHcSession, disconnectSharedHcSession} from '../../../lib/hc-shared-session';

const headers = {'Cache-Control': 'private, no-store'};
export async function GET(request: Request) {
  const session = await hcSessionForRequest(request);
  const configured = sessionConnectionConfigured() && (process.env.HC_SHARED_SESSION_MODE !== 'true' || !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID));
  return session.apply(Response.json({session: session.info, configured, canManage: await isHcAdmin(request)}, {headers}));
}
export async function POST(request: Request) {
  if (!allowedHcConnectionOrigin(request) || !request.headers.get('content-type')?.startsWith('application/json')) return Response.json({error: 'Origen no permitido.'}, {status: 403, headers});
  if (!await isHcAdmin(request)) return Response.json({error: 'Se necesita acceso de propietario.'}, {status: 403, headers});
  if (!sessionConnectionConfigured()) return Response.json({error: 'La conexión de sesión aún no está configurada en el servidor.'}, {status: 503, headers});
  try {
    if (Number(request.headers.get('content-length')) > 18000) throw Error();
    const text = await request.text();
    if (text.length > 18000) throw Error();
    const input = JSON.parse(text);
    if (process.env.HC_SHARED_SESSION_MODE === 'true') return Response.json(await connectSharedHcSession(input), {headers});
    return await connectHcSession(request, input);
  } catch { return Response.json({error: 'No se pudo conectar la sesión. Vuelve a conectarla desde Hidden Clearances.'}, {status: 401, headers}); }
}
export async function DELETE(request: Request) {
  if (!allowedHcConnectionOrigin(request)) return Response.json({error: 'Origen no permitido.'}, {status: 403, headers});
  if (!await isHcAdmin(request)) return Response.json({error: 'Se necesita acceso de propietario.'}, {status: 403, headers});
  if (process.env.HC_SHARED_SESSION_MODE === 'true') {
    try {await disconnectSharedHcSession(); return Response.json({disconnected: true}, {headers});}
    catch {return Response.json({error: 'No se pudo guardar la desconexión.'}, {status: 502, headers});}
  }
  // Forget only the Radar copy; do not sign the user out of Hidden Clearances.
  return clearHcSession(request, Response.json({disconnected: true}, {headers}));
}
