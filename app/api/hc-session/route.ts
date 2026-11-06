import {clearHcSession, connectHcSession, hcSessionForRequest, sessionConnectionConfigured} from '../../../lib/hc-session-service';
import {allowedHcConnectionOrigin} from '../../../lib/hc-connection-origin';

const headers = {'Cache-Control': 'private, no-store'};
export async function GET(request: Request) {
  const session = await hcSessionForRequest(request);
  return session.apply(Response.json({session: session.info, configured: sessionConnectionConfigured()}, {headers}));
}
export async function POST(request: Request) {
  if (!allowedHcConnectionOrigin(request) || !request.headers.get('content-type')?.startsWith('application/json')) return Response.json({error: 'Origen no permitido.'}, {status: 403, headers});
  if (!sessionConnectionConfigured()) return Response.json({error: 'La conexión de sesión aún no está configurada en el servidor.'}, {status: 503, headers});
  try {
    if (Number(request.headers.get('content-length')) > 18000) throw Error();
    const text = await request.text();
    if (text.length > 18000) throw Error();
    return await connectHcSession(request, JSON.parse(text));
  } catch { return Response.json({error: 'No se pudo conectar la sesión. Vuelve a conectarla desde Hidden Clearances.'}, {status: 401, headers}); }
}
export async function DELETE(request: Request) {
  if (!allowedHcConnectionOrigin(request)) return Response.json({error: 'Origen no permitido.'}, {status: 403, headers});
  // Forget only the Radar copy; do not sign the user out of Hidden Clearances.
  return clearHcSession(request, Response.json({disconnected: true}, {headers}));
}
