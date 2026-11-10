import {sameOriginRequest} from '../../../../lib/account';
import {accountClient, accountConfigured, accountJson, authError} from '../../../../lib/account-server';

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return accountJson({error: 'Solicitud no válida.'}, 403);
  if (!accountConfigured()) return accountJson({error: 'El acceso a cuentas todavía no está disponible.'}, 503);
  try {
    const body = await request.json() as Record<string, unknown> | null;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || email.length > 254 || !password || password.length > 128) return accountJson({error: 'Introduce tu email y contraseña.'}, 400);
    const client = await accountClient(request);
    const {error} = await client.auth.signInWithPassword({email, password});
    if (error) return accountJson({error: authError(error.code, error.status)}, error.status === 429 ? 429 : 401);
    return accountJson({success: true});
  } catch {return accountJson({error: 'No se pudo iniciar sesión. Vuelve a intentarlo.'}, 503);}
}
