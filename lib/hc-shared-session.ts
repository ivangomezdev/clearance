import {sessionAccess} from './hc-session.ts';
import {openHcSession, RefreshFailure, rotateHcCredentials, sealHcSession, verifyHcCredentials, type HcConfig, type HcSession} from './hc-session-service.ts';
import {blobSessionVault, mutateVault, type SessionVault} from './hc-session-vault.ts';

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export async function sharedHcSession(config: HcConfig, fetcher: typeof fetch = fetch, now = () => Date.now(), suppliedVault?: SessionVault): Promise<HcSession> {
  let vault: SessionVault, seen: string | undefined;
  const session: HcSession = {
    info: {status: 'public', shared: true},
    apply(response) {response.headers.set('Cache-Control', 'private, no-store'); return response;},
    async refresh() {
      if (!vault) return false;
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const current = await vault.read();
        if (!current.record.sealed) {session.token = undefined; session.info = {status: current.record.state === 'rejected' ? 'rejected' : 'public', shared: true}; return false;}
        const value = await openHcSession(current.record.sealed, config.HC_SESSION_SECRET);
        const access = sessionAccess(value.accessToken, now());
        if (current.record.sealed !== seen && access.token && Date.parse(access.info.expiresAt!) > now() + 120000) {
          seen = current.record.sealed; session.token = access.token; session.info = {...access.info, shared: true, renewable: true}; return true;
        }
        if (current.record.lock && current.record.lock.until > now()) {await delay(200); continue;}
        const id = crypto.randomUUID();
        const locked = await vault.write(current.etag, {...current.record, lock: {id, until: now() + 40000}});
        if (!locked) continue;
        try {
          const next = await rotateHcCredentials(value, fetcher, now);
          const sealed = await sealHcSession(next, config.HC_SESSION_SECRET);
          const saved = await vault.write(locked.etag, {...current.record, sealed, state: undefined, lock: undefined});
          if (!saved) {await delay(100); continue;} // An owner may have replaced the connection.
          seen = sealed; session.token = next.accessToken;
          session.info = {...sessionAccess(next.accessToken, now()).info, shared: true, renewable: true};
          return true;
        } catch (e) {
          const permanent = e instanceof RefreshFailure && e.permanent;
          const saved = await vault.write(locked.etag, {...current.record, ...(permanent ? {sealed: undefined, state: 'rejected'} : {}), lock: undefined});
          if (!saved) continue;
          session.token = permanent ? undefined : access.token;
          session.info = permanent ? {status: 'rejected', shared: true} : {...access.info, shared: true, renewable: true, renewalError: true};
          return false;
        }
      }
      session.info = {...session.info, renewalError: true}; return false;
    },
  };
  try {
    vault = suppliedVault || blobSessionVault(config);
    const current = await vault.read(); seen = current.record.sealed;
    if (!seen) {session.info = {status: current.record.state === 'rejected' ? 'rejected' : 'public', shared: true}; return session;}
    const value = await openHcSession(seen, config.HC_SESSION_SECRET), access = sessionAccess(value.accessToken, now());
    session.token = access.token; session.info = {...access.info, shared: true, renewable: true};
    if (Date.parse(access.info.expiresAt || '') <= now() + 120000) await session.refresh();
  } catch {session.token = undefined; session.info = {status: 'invalid', shared: true, renewalError: true};}
  return session;
}

export async function connectSharedHcSession(input: unknown, config: HcConfig = process.env, fetcher: typeof fetch = fetch, suppliedVault?: SessionVault) {
  const value = await verifyHcCredentials(input, config, fetcher);
  const sealed = await sealHcSession(value, config.HC_SESSION_SECRET);
  await mutateVault(suppliedVault || blobSessionVault(config), current => ({...current, sealed, lock: undefined, state: undefined}));
  return {session: {...sessionAccess(value.accessToken).info, shared: true, renewable: true}};
}
export async function disconnectSharedHcSession(config: HcConfig = process.env, suppliedVault?: SessionVault) {
  await mutateVault(suppliedVault || blobSessionVault(config), current => ({...current, sealed: undefined, lock: undefined, state: 'disconnected'}));
}
