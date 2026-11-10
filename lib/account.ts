export type AccountUser = {id: string; username: string; email: string; plan: string | null};
export type AccountState = {configured: boolean; user: AccountUser | null};

export function planLabel(plan: string | null) {
  return plan === 'free' ? 'Plan Gratis' : plan ? `Plan ${plan}` : 'Plan pendiente';
}

export function accountInitials(username: string) {
  return username.trim().slice(0, 2).toUpperCase();
}

export function validateRegistration(value: unknown, today = new Date().toISOString().slice(0, 10)) {
  if (!value || typeof value !== 'object') throw Error('Completa todos los campos.');
  const input = value as Record<string, unknown>;
  const username = typeof input.username === 'string' ? input.username.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const dateOfBirth = typeof input.dateOfBirth === 'string' ? input.dateOfBirth : '';
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) throw Error('El usuario debe tener de 3 a 24 letras, números o guiones bajos.');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Error('Introduce un email válido.');
  if (password.length < 8 || password.length > 128) throw Error('La contraseña debe tener entre 8 y 128 caracteres.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || !Number.isFinite(Date.parse(dateOfBirth)) || new Date(dateOfBirth).toISOString().slice(0, 10) !== dateOfBirth || dateOfBirth > today) throw Error('Introduce una fecha de nacimiento válida.');
  return {username, email, password, dateOfBirth};
}

export function accountOrigin(request: Request) {
  const url = new URL(request.url), host = request.headers.get('host');
  // Next can normalize loopback request URLs to localhost. Preserve the actual
  // host so local forms and confirmation links use the browser's origin.
  if (host) {
    const actual = new URL(`${url.protocol}//${host}`);
    if (actual.host === host.toLowerCase() && !actual.username && !actual.password && actual.pathname === '/') return actual.origin;
  }
  return url.origin;
}

export function sameOriginRequest(request: Request) {
  return request.headers.get('origin') === accountOrigin(request) && request.headers.get('sec-fetch-site') !== 'cross-site';
}
