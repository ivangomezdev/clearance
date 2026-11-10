import {accountOrigin, sameOriginRequest, validateRegistration} from '../../../../lib/account';
import {accountClient, accountConfigured, accountJson, authError} from '../../../../lib/account-server';

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return accountJson({error: 'Solicitud no válida.'}, 403);
  if (!accountConfigured()) return accountJson({error: 'El registro todavía no está disponible.'}, 503);
  let input;
  try {input = validateRegistration(await request.json());}
  catch (error) {return accountJson({error: error instanceof Error ? error.message : 'Revisa los datos del formulario.'}, 400);}
  try {
    const client = await accountClient(request);
    const {data: available, error: lookupError} = await client.rpc('is_username_available', {candidate: input.username});
    if (lookupError) return accountJson({error: 'No se pudo comprobar el usuario. Vuelve a intentarlo.'}, 503);
    if (available !== true) return accountJson({error: 'Ese nombre de usuario ya está en uso.'}, 409);
    const {data, error} = await client.auth.signUp({email: input.email, password: input.password,
      options: {data: {username: input.username, date_of_birth: input.dateOfBirth}, emailRedirectTo: `${accountOrigin(request)}/auth/callback`},
    });
    if (error) return accountJson({error: authError(error.code, error.status)}, error.status === 429 ? 429 : 400);
    return accountJson({success: true, confirmationRequired: !data.session});
  } catch {return accountJson({error: 'No se pudo crear tu cuenta. Vuelve a intentarlo.'}, 503);}
}
