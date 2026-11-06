import {BlobError, BlobPreconditionFailedError, get, put} from '@vercel/blob';
import type {HcConfig} from './hc-session-service.ts';

export type VaultRecord = {
  version: 1;
  sealed?: string;
  lock?: {id: string; until: number};
  usedSetupHash?: string;
  state?: 'rejected' | 'disconnected';
};
export type VaultSnapshot = {record: VaultRecord; etag: string | null};
export interface SessionVault {
  read(): Promise<VaultSnapshot>;
  write(expected: string | null, record: VaultRecord): Promise<VaultSnapshot | null>;
}

export function blobSessionVault(config: HcConfig = process.env): SessionVault {
  if (!config.BLOB_READ_WRITE_TOKEN && !(config.BLOB_STORE_ID && config.VERCEL_OIDC_TOKEN)) throw Error('El almacenamiento de sesión no está configurado.');
  const environment = config.VERCEL_ENV === 'production' ? 'production' : config.VERCEL_ENV === 'preview' ? 'preview' : 'development';
  const path = `private-auth/hc-${environment}-v1.json`;
  const options = {token: config.BLOB_READ_WRITE_TOKEN, storeId: config.BLOB_STORE_ID, abortSignal: AbortSignal.timeout(10000)};
  return {
    async read() {
      const blob = await get(path, {...options, abortSignal: AbortSignal.timeout(10000), access: 'private', useCache: false});
      if (!blob) return {record: {version: 1}, etag: null};
      if (blob.statusCode !== 200 || blob.blob.size > 24000) throw Error('Estado de sesión no válido.');
      const record = await new Response(blob.stream).json() as VaultRecord;
      if (record.version !== 1 || (record.sealed !== undefined && typeof record.sealed !== 'string')) throw Error('Estado de sesión no válido.');
      return {record, etag: blob.blob.etag};
    },
    async write(expected, record) {
      try {
        const result = await put(path, JSON.stringify(record), {...options, abortSignal: AbortSignal.timeout(10000), access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: expected !== null, ...(expected ? {ifMatch: expected} : {})});
        return {record, etag: result.etag};
      } catch (e) {
        if (e instanceof BlobPreconditionFailedError || (e instanceof BlobError && /already exists/i.test(e.message))) return null;
        throw e;
      }
    },
  };
}

export async function mutateVault(vault: SessionVault, mutate: (record: VaultRecord) => VaultRecord | null): Promise<boolean> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await vault.read(), next = mutate(current.record);
    if (!next) return false;
    if (await vault.write(current.etag, next)) return true;
  }
  throw Error('La conexión está ocupada. Vuelve a intentar.');
}
