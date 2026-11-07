import type {SessionInfo} from './hc-session.ts';

export type OwnerConnectionState = {session: SessionInfo; configured: boolean; canManage: boolean; setupError?: string};
// Keep an in-flight one-time exchange through effect replay, while allowing a new
// fragment invitation to replace a previous one without reloading the page.
export function createHcOwnerClient(fetcher: typeof fetch = fetch) {
  const exchanges = new Map<string, Promise<string | undefined>>();
  let latestSetup: string | undefined;
  async function inspect(signal?: AbortSignal): Promise<OwnerConnectionState> {
    const response = await fetcher('/api/hc-session', {signal, cache: 'no-store'});
    if (!response.ok) throw Error('No se pudo comprobar el acceso. Vuelve a intentar.');
    return await response.json() as OwnerConnectionState;
  }
  return {
    inspect,
    async check(setup?: string, signal?: AbortSignal): Promise<OwnerConnectionState> {
      if (setup) latestSetup = setup;
      let setupError: string | undefined;
      if (latestSetup) {
        const current = latestSetup;
        let exchange = exchanges.get(current);
        if (!exchange) {
          exchange = (async () => {
            try {
              const r = await fetcher('/api/hc-admin', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({setup: current})});
              if (r.ok) return undefined;
              const body = await r.json() as {error?: string};
              return body.error || 'No se pudo autorizar el acceso. Vuelve a abrir el enlace.';
            } catch {return 'No se pudo contactar con el servidor. Vuelve a abrir este enlace.';}
          })();
          exchanges.set(current, exchange);
        }
        setupError = await exchange;
        if (setupError && exchanges.get(current) === exchange) exchanges.delete(current);
      }
      const body = await inspect(signal);
      return {...body, setupError: body.canManage ? undefined : setupError};
    },
  };
}
