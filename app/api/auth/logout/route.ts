import {sameOriginRequest} from '../../../../lib/account';
import {accountClient, accountConfigured, accountJson} from '../../../../lib/account-server';

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return accountJson({error: 'Solicitud no válida.'}, 403);
  if (!accountConfigured()) return accountJson({success: true});
  try {
    const {error} = await (await accountClient(request)).auth.signOut({scope: 'local'});
    if (error) return accountJson({error: 'No se pudo cerrar la sesión. Inténtalo de nuevo.'}, 503);
    return accountJson({success: true});
  } catch {return accountJson({error: 'No se pudo cerrar la sesión. Inténtalo de nuevo.'}, 503);}
}
