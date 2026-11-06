import {authorizeHcAdmin, isHcAdmin} from '../../../lib/hc-admin';
import {allowedHcConnectionOrigin} from '../../../lib/hc-connection-origin';

const headers = {'Cache-Control': 'private, no-store'};
export async function POST(request: Request) {
  if (!allowedHcConnectionOrigin(request) || !request.headers.get('content-type')?.startsWith('application/json')) return Response.json({error: 'Origen no permitido.'}, {status: 403, headers});
  // A valid owner cookie also makes repeated delivery of the initial link harmless.
  if (await isHcAdmin(request)) return Response.json({authorized: true}, {headers});
  try {
    if (Number(request.headers.get('content-length')) > 256) throw Error();
    const text = await request.text(); if (text.length > 256) throw Error();
    const body = JSON.parse(text);
    if (typeof body.setup !== 'string') throw Error();
    return await authorizeHcAdmin(request, body.setup);
  } catch {return Response.json({error: 'El enlace privado venció o ya se utilizó. Solicita un enlace de administración nuevo.'}, {status: 401, headers});}
}
