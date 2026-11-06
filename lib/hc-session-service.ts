import {sessionAccess, type SessionInfo} from './hc-session.ts';
import {HC_AUTH_ORIGIN, HC_ANON_KEY} from './hc-public.ts';

export type HcCredentials = {accessToken: string; refreshToken: string};
type Config = {HC_SESSION_SECRET?: string; HC_ACCESS_TOKEN?: string; [key: string]: string | undefined};
type Fetcher = typeof fetch;
export type HcSession = {
  token?: string;
  info: SessionInfo;
  refresh(): Promise<boolean>;
  apply(response: Response): Response;
};
const age = 30 * 24 * 60 * 60;
const cookieSize = 3400, maxChunks = 4;
const encoder = new TextEncoder();
const aad = encoder.encode('clearance-radar:hc-session:v1');
const flights = new Map<string, {until: number; promise: Promise<HcCredentials>}>();

function credentials(value: unknown): HcCredentials {
  if (!value || typeof value !== 'object' || !('accessToken' in value) || !('refreshToken' in value) ||
      typeof value.accessToken !== 'string' || typeof value.refreshToken !== 'string' ||
      !/^[A-Za-z0-9_-]{8,4096}$/.test(value.refreshToken) || value.accessToken.length > 12000 ||
      sessionAccess(value.accessToken).info.status === 'invalid') throw Error('Sesión de Hidden Clearances no válida.');
  return {accessToken: value.accessToken, refreshToken: value.refreshToken};
}
function claims(token: string) { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); }
function secretKey(secret?: string) {
  const key = Buffer.from(secret || '', 'base64url');
  if (key.length !== 32) throw Error('La conexión de sesión aún no está configurada en el servidor.');
  return crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function sealHcSession(value: HcCredentials, secret?: string): Promise<string> {
  const key = await secretKey(secret), iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: aad}, key, encoder.encode(JSON.stringify(credentials(value))));
  const packed = new Uint8Array(iv.length + encrypted.byteLength);
  packed.set(iv); packed.set(new Uint8Array(encrypted), iv.length);
  const result = 'v1.' + Buffer.from(packed).toString('base64url');
  if (result.length > cookieSize * maxChunks) throw Error('La sesión es demasiado grande.');
  return result;
}
export async function openHcSession(value: string, secret?: string): Promise<HcCredentials> {
  if (!/^v1\.[\w-]+$/.test(value) || value.length > cookieSize * maxChunks) throw Error('Sesión no válida.');
  const bytes = Buffer.from(value.slice(3), 'base64url'), key = await secretKey(secret);
  const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: aad}, key, bytes.subarray(12));
  return credentials(JSON.parse(new TextDecoder().decode(plain)));
}
function cookieName(request: Request) { return new URL(request.url).protocol === 'https:' ? '__Host-radar-hc' : 'radar-hc'; }
function cookieParts(request: Request): string | undefined {
  const name = cookieName(request);
  const pairs = (request.headers.get('cookie') || '').split(';').map(pair => {const i = pair.indexOf('='); return [pair.slice(0, i).trim(), pair.slice(i + 1)];});
  const chunks = pairs.filter(([key]) => key.startsWith(name + '.')).sort((a, b) => a[0].localeCompare(b[0]));
  if (!chunks.length) return undefined;
  if (chunks.length > maxChunks || chunks.some(([key], i) => key !== `${name}.${i}`)) throw Error('Sesión incompleta.');
  return chunks.map(([, value]) => value).join('');
}
function setCookies(request: Request, value: string | null): string[] {
  const name = cookieName(request), secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return Array.from({length: maxChunks}, (_, i) => {
    const chunk = value?.slice(i * cookieSize, (i + 1) * cookieSize) || '';
    return `${name}.${i}=${chunk}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${chunk ? age : 0}${secure}`;
  });
}
function applyCookies(response: Response, cookies: string[]) {
  response.headers.set('Cache-Control', 'private, no-store');
  for (const cookie of cookies) response.headers.append('Set-Cookie', cookie);
  return response;
}
export function clearHcSession(request: Request, response: Response) { return applyCookies(response, setCookies(request, null)); }

class RefreshFailure extends Error {
  readonly permanent: boolean;
  constructor(permanent: boolean) { super('No se pudo renovar la sesión de Hidden Clearances.'); this.permanent = permanent; }
}
async function rotate(value: HcCredentials, fetcher: Fetcher, now: () => number): Promise<HcCredentials> {
  const key = Buffer.from(await crypto.subtle.digest('SHA-256', encoder.encode(value.refreshToken))).toString('base64url');
  for (const [id, flight] of flights) if (flight.until < now()) flights.delete(id);
  const current = flights.get(key);
  if (current) return current.promise;
  const promise = (async () => {
    let response: Response;
    try {
      response = await fetcher(`${HC_AUTH_ORIGIN}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: {'Content-Type': 'application/json', apikey: HC_ANON_KEY},
        body: JSON.stringify({refresh_token: value.refreshToken}), signal: AbortSignal.timeout(15000), cache: 'no-store', redirect: 'error',
      });
    } catch { throw new RefreshFailure(false); }
    if (!response.ok) throw new RefreshFailure([400, 401, 403].includes(response.status));
    try {
      const body = await response.json() as {access_token?: string; refresh_token?: string};
      const next = credentials({accessToken: body.access_token, refreshToken: body.refresh_token});
      const before = claims(value.accessToken), after = claims(next.accessToken);
      if (sessionAccess(next.accessToken, now()).info.status !== 'active' || !before.sub || before.sub !== after.sub || before.session_id !== after.session_id) throw Error();
      return next;
    } catch { throw new RefreshFailure(false); }
  })();
  if (flights.size > 256) flights.delete(flights.keys().next().value!);
  flights.set(key, {until: now() + 20000, promise});
  try {
    const next = await promise;
    // Briefly share the rotation result for simultaneous requests. No disk or logs.
    flights.set(key, {until: now() + 10000, promise: Promise.resolve(next)});
    return next;
  } catch (e) { flights.delete(key); throw e; }
}

export async function hcSessionForRequest(request: Request, config: Config = process.env, fetcher: Fetcher = fetch, now = () => Date.now()): Promise<HcSession> {
  let value: HcCredentials | undefined, cookieUpdates: string[] = [], hasCookie = false;
  const fallback = sessionAccess(config.HC_ACCESS_TOKEN, now());
  const session: HcSession = {
    token: fallback.token, info: fallback.info,
    async refresh() {
      if (!value) return false;
      try {
        const next = await rotate(value, fetcher, now);
        const sealed = await sealHcSession(next, config.HC_SESSION_SECRET);
        value = next; session.token = next.accessToken;
        session.info = {...sessionAccess(next.accessToken, now()).info, renewable: true};
        cookieUpdates = setCookies(request, sealed);
        return true;
      } catch (e) {
        if (e instanceof RefreshFailure && e.permanent) {
          session.token = undefined; value = undefined;
          session.info = {status: 'rejected', renewable: false};
          cookieUpdates = setCookies(request, null);
        } else {
          const access = sessionAccess(value.accessToken, now());
          session.token = access.token; session.info = {...access.info, renewable: true, renewalError: true};
        }
        return false;
      }
    },
    apply(response) { return applyCookies(response, cookieUpdates); },
  };
  try {
    const packed = cookieParts(request); hasCookie = packed !== undefined;
    if (packed !== undefined) value = await openHcSession(packed, config.HC_SESSION_SECRET);
  } catch {
    hasCookie = true; session.token = undefined; session.info = {status: 'invalid'}; cookieUpdates = setCookies(request, null);
  }
  if (!value) { if (hasCookie) session.token = undefined; return session; }
  const access = sessionAccess(value.accessToken, now());
  session.token = access.token; session.info = {...access.info, renewable: true};
  if (Date.parse(access.info.expiresAt || '') <= now() + 120000) await session.refresh();
  return session;
}

// Connect only this browser's session. Verification is performed by the issuer.
export async function connectHcSession(request: Request, input: unknown, config: Config = process.env, fetcher: Fetcher = fetch): Promise<Response> {
  await secretKey(config.HC_SESSION_SECRET);
  let value = credentials(input);
  if (!sessionAccess(value.accessToken).token) value = await rotate(value, fetcher, () => Date.now());
  const response = await fetcher(`${HC_AUTH_ORIGIN}/auth/v1/user`, {
    headers: {apikey: HC_ANON_KEY, Authorization: `Bearer ${value.accessToken}`}, signal: AbortSignal.timeout(15000), cache: 'no-store', redirect: 'error',
  });
  if (!response.ok) throw Error('La sesión no es válida. Conecta de nuevo desde Hidden Clearances.');
  const user = await response.json() as {id?: string};
  if (!user.id || user.id !== claims(value.accessToken).sub) throw Error('La sesión no es válida.');
  return applyCookies(Response.json({session: {...sessionAccess(value.accessToken).info, renewable: true}}), setCookies(request, await sealHcSession(value, config.HC_SESSION_SECRET)));
}

export function sessionConnectionConfigured(config: Config = process.env) {
  try { return Buffer.from(config.HC_SESSION_SECRET || '', 'base64url').length === 32; } catch { return false; }
}
