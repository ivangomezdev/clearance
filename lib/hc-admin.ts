import {mutateVault, type SessionVault, blobSessionVault} from './hc-session-vault.ts';
import type {HcConfig} from './hc-session-service.ts';

const encoder = new TextEncoder(), lifetime = 30 * 24 * 60 * 60;
export class HcAdminSetupError extends Error {
  readonly code: 'INVALID_LINK' | 'EXPIRED_LINK' | 'USED_LINK' | 'NOT_CONFIGURED' | 'STORAGE_UNAVAILABLE';
  readonly status: number;
  constructor(code: HcAdminSetupError['code'], message: string, status = 401) {super(message); this.code = code; this.status = status;}
}
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
  if (!/^[\w-]{43}$/.test(setup)) throw new HcAdminSetupError('INVALID_LINK', 'El enlace privado no es válido. Copia la dirección completa del enlace nuevo.');
  if (!/^[a-f0-9]{64}$/.test(config.HC_ADMIN_SETUP_HASH || '') || !Number.isFinite(Number(config.HC_ADMIN_SETUP_EXPIRES_AT)) || !config.HC_ADMIN_SETUP_EXPIRES_AT) throw new HcAdminSetupError('NOT_CONFIGURED', 'La administración aún no está configurada en el servidor.', 503);
  if (Number(config.HC_ADMIN_SETUP_EXPIRES_AT) < now) throw new HcAdminSetupError('EXPIRED_LINK', 'El enlace privado venció. Solicita uno nuevo.');
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', encoder.encode(setup))).toString('hex');
  const expected = config.HC_ADMIN_SETUP_HASH || '';
  let difference = expected.length ^ hash.length;
  for (let i = 0; i < hash.length; i++) difference |= hash.charCodeAt(i) ^ (expected.charCodeAt(i) || 0);
  if (difference) throw new HcAdminSetupError('INVALID_LINK', 'Este enlace privado fue reemplazado. Abre el enlace más reciente.');
  let signingKey: CryptoKey;
  try {signingKey = await key(config);} catch {throw new HcAdminSetupError('NOT_CONFIGURED', 'La administración aún no está configurada en el servidor.', 503);}
  let used: boolean;
  try {used = await mutateVault(vault || blobSessionVault(config), current => current.usedSetupHash === hash ? null : {...current, usedSetupHash: hash});}
  catch {throw new HcAdminSetupError('STORAGE_UNAVAILABLE', 'No se pudo guardar el acceso en el servidor. Espera un momento y vuelve a abrir este enlace.', 503);}
  if (!used) throw new HcAdminSetupError('USED_LINK', 'El enlace ya se utilizó en otro navegador. Solicita uno nuevo para este navegador.');
  const expires = String(now + lifetime * 1000), nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString('base64url');
  const signature = Buffer.from(await crypto.subtle.sign('HMAC', signingKey, encoder.encode(`radar-owner:v1:${expires}.${nonce}`))).toString('base64url');
  const response = Response.json({authorized: true}, {headers: {'Cache-Control': 'private, no-store'}});
  response.headers.append('Set-Cookie', `${name(request)}=${expires}.${nonce}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${lifetime}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`);
  return response;
}
