// This function runs only when the user activates the saved bookmark on the source site.
// Transfer only the la cuenta de inventario session, never Google credentials or other cookies.
function sendCurrentSession(target: string) {
  const source = 'https://www.hiddenclearances.com';
  if (location.origin !== source) { alert('Abre la cuenta de inventario e inicia sesión antes de usar este marcador.'); return; }
  const name = 'sb-cdqqxarqppyvctffzsax-auth-token';
  let session: {access_token?: string; refresh_token?: string};
  try {
    const pairs = document.cookie.split(';').map(pair => {const i = pair.indexOf('='); return [pair.slice(0, i).trim(), pair.slice(i + 1)];});
    const single = pairs.find(([key]) => key === name)?.[1];
    const chunks = pairs.filter(([key]) => key.startsWith(name + '.')).sort((a, b) => Number(a[0].slice(name.length + 1)) - Number(b[0].slice(name.length + 1)));
    if (chunks.some(([key], i) => key !== `${name}.${i}`)) throw Error();
    let raw = decodeURIComponent(single || chunks.map(([, value]) => value).join('') || localStorage.getItem(name) || '');
    if (raw.startsWith('base64-')) raw = new TextDecoder().decode(Uint8Array.from(atob(raw.slice(7).replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0)));
    session = JSON.parse(raw);
    if (typeof session.access_token !== 'string' || typeof session.refresh_token !== 'string') throw Error();
  } catch { alert('No se encontró una sesión activa de la cuenta de inventario. Inicia sesión y vuelve a usar el marcador.'); return; }
  const challenge = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  const popup = window.open(`${target}/settings/inventory#pair=${challenge}`, '_blank');
  if (!popup) { alert('Permite abrir la ventana de conexión y vuelve a usar el marcador.'); return; }
  const timer = setTimeout(cleanup, 120000);
  function cleanup() { clearTimeout(timer); window.removeEventListener('message', receive); session = {}; }
  function receive(event: MessageEvent) {
    if (event.origin !== target || event.source !== popup || event.data?.type !== 'radar-hc-ready' || event.data?.challenge !== challenge) return;
    popup!.postMessage({type: 'radar-hc-session', challenge, accessToken: session.access_token, refreshToken: session.refresh_token}, target);
    cleanup();
  }
  window.addEventListener('message', receive);
}

export function hiddenClearancesBookmark(origin: string) {
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw Error('Destino de conexión no válido.');
  return 'javascript:' + encodeURIComponent(`(${sendCurrentSession.toString()})(${JSON.stringify(origin)});void(0);`);
}
