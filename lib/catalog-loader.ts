import {validatePage, type Deal} from './deals.ts';
import type {SessionInfo} from './hc-session.ts';

type CatalogPage = {success?: boolean; session?: SessionInfo; lockedSkipped?: number; data: Deal[]; pagination: {page: number; totalPages: number; total: number}; error?: string};
export type CatalogLog = {path: string; status: number; ms: number; count: number; time: string; pagination?: CatalogPage['pagination']; error?: string};
export type CatalogSnapshot = {deals: Deal[]; total: number; completed: number; pages: number; feedAdded: number; feedLocked: number};
type Options = {
  signal: AbortSignal;
  includeHistory: boolean;
  onChange(snapshot: CatalogSnapshot): void;
  onFirstPage?(): void;
  onSession?(session: SessionInfo): void;
  onLog?(entry: CatalogLog): void;
  fetcher?: typeof fetch;
  spacingMs?: number;
  minimumRetryMs?: number;
};

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {clearTimeout(timer); reject(signal.reason);};
    const timer = setTimeout(() => {signal.removeEventListener('abort', abort); resolve();}, ms);
    signal.addEventListener('abort', abort, {once: true});
  });
}

// Two catalog workers and one feed worker share the same admission gate.
// Requests overlap in flight, but starts stay spaced and every worker respects 429s.
export async function loadCatalog(options: Options) {
  const {includeHistory, onChange, onFirstPage, onSession, onLog, fetcher = fetch, spacingMs = 1250, minimumRetryMs = 65000} = options;
  const controller = new AbortController(), signal = controller.signal;
  const abort = () => controller.abort(options.signal.reason);
  options.signal.addEventListener('abort', abort, {once: true});
  if (options.signal.aborted) abort();
  const catalog = new Map<string, Deal>(), feed = new Map<string, Deal>();
  let total = 0, pages = 0, completed = 0, feedLocked = 0;
  let gate = Promise.resolve(), nextStart = 0, cooldownUntil = 0;

  async function admit() {
    const previous = gate;
    let release!: () => void;
    gate = new Promise<void>(resolve => {release = resolve;});
    try {
      await previous;
      signal.throwIfAborted();
      // A rate limit can extend the deadline while another worker is waiting.
      while (Math.max(nextStart, cooldownUntil) > Date.now()) {
        await wait(Math.max(nextStart, cooldownUntil) - Date.now(), signal);
      }
      signal.throwIfAborted();
      nextStart = Date.now() + spacingMs;
    } finally {release();}
  }

  function publish() {
    const merged = new Map(feed);
    catalog.forEach((deal, id) => merged.set(id, deal));
    onChange({deals: [...merged.values()], total, completed, pages,
      feedAdded: [...feed.keys()].filter(id => !catalog.has(id)).length, feedLocked});
  }

  async function getPage(source: 'deals' | 'feed', page: number) {
    const query = `page=${page}${source === 'deals' ? `&activeOnly=${!includeHistory}` : ''}`;
    const path = `/api/v1/${source}?limit=50&${query}`;
    for (let attempt = 0; attempt < 4; attempt++) {
      await admit();
      const started = performance.now();
      let response: Response;
      try {response = await fetcher(`/api/${source}?${query}`, {signal});}
      catch (error) {
        if (!signal.aborted) onLog?.({path, status: 0, ms: Math.round(performance.now() - started), count: 0, time: new Date().toISOString(), error: 'Error de conexión'});
        throw error;
      }
      const body = await response.json() as CatalogPage;
      signal.throwIfAborted();
      if (body.session) onSession?.(body.session);
      onLog?.({path, status: response.status, ms: Math.round(performance.now() - started), count: Array.isArray(body.data) ? body.data.length : 0, time: new Date().toISOString(), pagination: body.pagination, error: body.error});
      if (response.status === 429) {
        const header = response.headers.get('retry-after');
        const retryMs = header ? (Number.isFinite(Number(header)) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : minimumRetryMs;
        cooldownUntil = Math.max(cooldownUntil, Date.now() + Math.max(minimumRetryMs, Number.isFinite(retryMs) ? retryMs : minimumRetryMs));
        if (attempt < 3) continue;
      }
      if (!response.ok || body.success === false) throw Error(response.status === 429 ? 'La API limitó las solicitudes. Espera un momento y vuelve a sincronizar.' : body.error || `Error HTTP ${response.status}`);
      if (!Array.isArray(body.data) || !body.pagination || !Number.isInteger(body.pagination.totalPages) || body.pagination.totalPages < 0) throw Error('El formato de la API ha cambiado.');
      validatePage(page, body.pagination.page);
      const target = source === 'deals' ? catalog : feed;
      body.data.forEach(deal => {if (deal.id) target.set(deal.id, deal);});
      if (source === 'deals') {completed++; total = body.pagination.total; pages = body.pagination.totalPages;}
      else feedLocked += body.lockedSkipped || 0;
      publish();
      if (source === 'deals' && page === 1) onFirstPage?.();
      return body.pagination.totalPages;
    }
    throw Error('No se pudo completar la carga.');
  }

  try {
    const catalogPages = await getPage('deals', 1);
    let nextPage = 2;
    const catalogWorker = async () => {
      while (nextPage <= catalogPages) {const page = nextPage++; await getPage('deals', page);}
    };
    const feedWorker = async () => {
      let feedPages = 1;
      for (let page = 1; page <= feedPages; page++) feedPages = await getPage('feed', page);
    };
    await Promise.all([catalogWorker(), catalogWorker(), feedWorker()]);
    signal.throwIfAborted();
  } catch (error) {
    controller.abort(error);
    throw error;
  } finally {options.signal.removeEventListener('abort', abort);}
}
