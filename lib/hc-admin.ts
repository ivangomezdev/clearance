import {mutateVault, type SessionVault, blobSessionVault} from './hc-session-vault.ts';
import type {HcConfig} from './hc-session-service.ts';

const encoder = new TextEncoder(), lifetime = 30 * 24 * 60 * 60;
function name(request: Request) {return new URL(request.url).protocol === 'https:' ? '__Host-radar-owner' : 'radar-owner';}
function cookie(request: Request) {const prefix = name(request) + '='; return (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(prefix))?.slice(prefix.length);}
async function key(config: HcConfig) {
  const bytes = Buffer.from(config.HC_SESSION_SECRET || '', 'base64url');
  if (bytes.length !== 32) throw Error('La administración no está configurada.');
  return crypto.subtle.importKey('raw', bytes, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);
}
export async function isHcAdmin(request: Request, config: HcConfig = process.env, now = Date.now()): Promise<boolean> {
  try {
    const value = cookie(request) || '', [expires, nonce, signature] = value.split('.');
    if (!/^\d+$/.test(expires) || !Number.isSafeInteger(Number(expires)) || Number(expires) < now || !/^[\w-]{16,64}$/.test(nonce || '') || !signature) return false;
    return await crypto.subtle.verify('HMAC', await key(config), Buffer.from(signature, 'base64url'), encoder.encode(`radar-owner:v1:${expires}.${nonce}`));
  } catch {return false;}
}
export async function authorizeHcAdmin(request: Request, setup: string, config: HcConfig = process.env, vault?: SessionVault, now = Date.now()): Promise<Response> {
  if (!/^[\w-]{43}$/.test(setup) || Number(config.HC_ADMIN_SETUP_EXPIRES_AT || 0) < now) throw Error('El enlace de administración venció.');
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', encoder.encode(setup))).toString('hex');
  const expected = config.HC_ADMIN_SETUP_HASH || '';
  let difference = expected.length ^ hash.length;
  for (let i = 0; i < hash.length; i++) difference |= hash.charCodeAt(i) ^ (expected.charCodeAt(i) || 0);
  if (difference) throw Error('El enlace de administración no es válido.');
  const signingKey = await key(config);
  const used = await mutateVault(vault || blobSessionVault(config), current => current.usedSetupHash === hash ? null : {...current, usedSetupHash: hash});
  if (!used) throw Error('El enlace de administración ya se utilizó.');
  const expires = String(now + lifetime * 1000), nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString('base64url');
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', signingKey, encoder.encode(`radar-owner:v1:${expires}.${nonce}`))).toString('base64url');
  const response = Response.json({authorized: true}, {headers: {'Cache-Control': 'private, no-store'}});
  response.headers.append('Set-Cookie', `${name(request)}=${expires}.${nonce}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${lifetime}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`);
  return response;
}
