import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {AccountUser} from './account';

export function accountConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY);
}

// Used only by Route Handlers, where refreshed cookies can be written back.
// Browser code never receives a session token or a database administration key.
export async function accountClient(request: Request) {
  if (!accountConfigured()) throw Error('ACCOUNT_NOT_CONFIGURED');
  const jar = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: {name: 'radar-account', path: '/', httpOnly: true, sameSite: 'lax', secure: new URL(request.url).protocol === 'https:'},
    cookies: {
      getAll: () => jar.getAll(),
      setAll: values => {values.forEach(({name, value, options}) => jar.set(name, value, options));},
    },
    global: {fetch: (input, init) => fetch(input, {...init, cache: 'no-store', signal: init?.signal ?? AbortSignal.timeout(15000)})},
  });
}

export async function readAccount(client: SupabaseClient): Promise<AccountUser | null> {
  const {data: {user}, error} = await client.auth.getUser();
  if (error) {
    const endedSession = ['refresh_token_not_found', 'refresh_token_already_used', 'bad_jwt', 'session_not_found', 'user_not_found'].includes(error.code || '');
    if (endedSession || error.name === 'AuthSessionMissingError' || error.status === 401 || error.status === 403) return null;
    throw Error('No se pudo comprobar tu sesión. Vuelve a intentarlo.');
  }
  if (!user) return null;
  const {data: profile, error: profileError} = await client.from('profiles').select('username, plan').eq('id', user.id).single();
  if (profileError || !profile || typeof profile.username !== 'string') throw Error('No se pudo cargar tu perfil. Vuelve a intentarlo.');
  return {id: user.id, username: profile.username, email: user.email || '', plan: typeof profile.plan === 'string' ? profile.plan : null};
}

export function accountJson(body: unknown, status = 200) {
  return Response.json(body, {status, headers: {'Cache-Control': 'private, no-store, max-age=0', 'Pragma': 'no-cache', 'Vary': 'Cookie'}});
}

export function authError(code?: string, status?: number) {
  if (status === 429) return 'Demasiados intentos. Espera un momento antes de volver a probar.';
  if (code === 'email_not_confirmed') return 'Confirma tu email antes de iniciar sesión.';
  if (code === 'invalid_credentials') return 'El email o la contraseña no son correctos.';
  if (code === 'weak_password') return 'Elige una contraseña más segura.';
  return 'No se pudo completar la solicitud. Vuelve a intentarlo.';
}
