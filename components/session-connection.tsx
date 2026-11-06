'use client';

import {useEffect, useRef, useState} from 'react';
import {ArrowLeft, CheckCircle2, Link2, RefreshCw} from 'lucide-react';
import {hiddenClearancesBookmark} from '../lib/hc-session-bridge';
import type {SessionInfo} from '../lib/hc-session';

const source = 'https://www.hiddenclearances.com';
type Pending = {accessToken: string; refreshToken: string};
export function SessionConnection() {
  const [status, setStatus] = useState<SessionInfo | null>(null), [configured, setConfigured] = useState<boolean | null>(null);
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [pending, setPending] = useState<Pending | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [hint, setHint] = useState('');
  const bookmark = useRef<HTMLAnchorElement>(null), marker = useRef(''), pairing = useRef<string | null>(null);
  const setupAttempt = useRef<Promise<void> | null>(null);
  useEffect(() => {if (marker.current) bookmark.current?.setAttribute('href', marker.current);}, [canManage, pending, status]);
  useEffect(() => {
    marker.current = hiddenClearancesBookmark(location.origin);
    // React blocks javascript URLs in JSX; this fixed, locally generated bookmark
    // is intentionally draggable and never executed by this page.
    bookmark.current?.setAttribute('href', marker.current);
    const c = new AbortController();
    const hash = new URLSearchParams(location.hash.slice(1));
    const setup = hash.get('setup');
    // Do not abort or duplicate a one-time setup exchange during React's effect replay.
    if (setup && !setupAttempt.current) setupAttempt.current = fetch('/api/hc-admin', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({setup})}).then(async r => {
      if (!r.ok) throw Error('El enlace privado venció o ya se utilizó. Solicita uno nuevo.');
    });
    (async () => {
      if (setupAttempt.current) await setupAttempt.current;
      const r = await fetch('/api/hc-session', {signal: c.signal});
      const body = await r.json() as {session: SessionInfo; configured: boolean; canManage: boolean};
      if (!c.signal.aborted) {setStatus(body.session); setConfigured(body.configured); setCanManage(body.canManage);}
    })().catch(e => {if (!c.signal.aborted) {setError(e instanceof Error ? e.message : 'No se pudo comprobar la conexión.'); setCanManage(false);}});
    const challenge = pairing.current || hash.get('pair');
    pairing.current = challenge;
    if (challenge || setup) history.replaceState(null, '', location.pathname);
    let timer: ReturnType<typeof setInterval> | undefined, timeout: ReturnType<typeof setTimeout> | undefined;
    function receive(event: MessageEvent) {
      if (!challenge || !/^[a-f0-9]{32}$/.test(challenge) || event.origin !== source || event.source !== window.opener || event.data?.type !== 'radar-hc-session' || event.data?.challenge !== challenge) return;
      if (typeof event.data.accessToken !== 'string' || typeof event.data.refreshToken !== 'string' || event.data.accessToken.length > 12000 || event.data.refreshToken.length > 4096) return;
      setPending({accessToken: event.data.accessToken, refreshToken: event.data.refreshToken});
      clearInterval(timer); clearTimeout(timeout); window.removeEventListener('message', receive);
    }
    window.addEventListener('message', receive);
    if (challenge && /^[a-f0-9]{32}$/.test(challenge) && window.opener) {
      const ready = () => window.opener?.postMessage({type: 'radar-hc-ready', challenge}, source);
      ready(); timer = setInterval(ready, 500);
      timeout = setTimeout(() => {clearInterval(timer); window.removeEventListener('message', receive); setHint('La conexión inicial venció. Vuelve a activar el marcador en Hidden Clearances.');}, 120000);
    }
    return () => {c.abort(); clearInterval(timer); clearTimeout(timeout); window.removeEventListener('message', receive);};
  }, []);
  async function connect() {
    if (!pending || busy || !canManage) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/hc-session', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(pending)});
      setPending(null);
      const body = await r.json() as {session?: SessionInfo; error?: string};
      if (!r.ok || !body.session) throw Error(body.error || 'No se pudo conectar la sesión.');
      setStatus(body.session);
    } catch (e) {setError(e instanceof Error ? e.message : 'No se pudo conectar la sesión.');} finally {setBusy(false);}
  }
  async function disconnect() {
    if (busy) return; setBusy(true); setError('');
    try {const r = await fetch('/api/hc-session', {method: 'DELETE'}); if (!r.ok) throw Error(); setStatus({status: 'public', shared: true}); setHint('Se desconectó el inventario de Radar. Tu sesión en Hidden Clearances sigue abierta.');}
    catch {setError('No se pudo desconectar. Vuelve a intentar.');} finally {setBusy(false);}
  }
  return <main className="connection-page">
    <a className="connection-back" href="/"><ArrowLeft size={16}/> Volver a las ofertas</a>
    <div className="connection-card"><span className="connection-symbol"><Link2 size={26}/></span>
      <h1>Conexión de inventario</h1>
      <p>Administración del propietario. Los visitantes solo introducen su ZIP para consultar tiendas; la conexión se mantiene en el servidor.</p>
      {canManage === null ? <p role="status">Comprobando acceso…</p> : !canManage ? <p className="connection-hint">Esta sección requiere el enlace privado del propietario. Para buscar tiendas, vuelve a las ofertas e introduce tu ZIP.</p>
      : status?.status === 'active' && status.renewable && !pending ? <div className="connection-success"><CheckCircle2 size={21}/><strong>Inventario conectado · renovación automática</strong><a className="primary" href="/">Buscar ofertas y tiendas</a><button disabled={busy} onClick={disconnect}>Desconectar el inventario</button></div>
      : pending ? <div className="connection-ready"><h2>Tu sesión está lista</h2><p>Se conectará la sesión de Hidden Clearances que acabas de seleccionar. Se guardará cifrada en el servidor para que los visitantes puedan consultar el inventario.</p><button className="primary" disabled={busy || configured !== true} onClick={connect}>{busy ? <><RefreshCw size={16} className="spin"/> Conectando…</> : 'Conectar esta sesión'}</button></div>
      : <ol className="connection-steps"><li><strong>Guarda este marcador</strong><p>Arrastra el botón a la barra de marcadores de tu navegador.</p><a ref={bookmark} draggable className="primary" onClick={e => {e.preventDefault(); setHint('Arrastra este botón a la barra de marcadores; se activa después desde Hidden Clearances.');}}>Conectar con Radar</a><button className="connection-copy" onClick={async () => {try {await navigator.clipboard.writeText(marker.current); setHint('Marcador copiado. Guárdalo como la dirección de un nuevo marcador.');} catch {setError('No se pudo copiar. Arrastra el botón a la barra de marcadores.');}}}>Copiar marcador</button></li>
        <li><strong>Abre tu sesión habitual</strong><p><a href="https://www.hiddenclearances.com/verified-deals" target="_blank" rel="noopener noreferrer">Abre Hidden Clearances</a> en ese navegador e inicia sesión si hace falta.</p></li>
        <li><strong>Activa el marcador</strong><p>Desde Hidden Clearances, pulsa «Conectar con Radar». Se abrirá aquí la confirmación de conexión.</p></li></ol>}
      {canManage && configured === false && <p className="redirect-warning" role="alert">Falta configurar la conexión de sesión en el alojamiento. Todavía no envíes tu sesión.</p>}
      {hint && <p role="status" className="connection-hint">{hint}</p>}{error && <p role="alert" className="redirect-warning">{error}</p>}
      {canManage && <p className="connection-note">No se copia tu contraseña ni la sesión de Google. Los tokens de Hidden Clearances se envían únicamente a este sitio y se guardan cifrados en almacenamiento privado. Si revocas la sesión en el origen, tendrás que conectarla de nuevo.</p>}
    </div>
  </main>;
}
