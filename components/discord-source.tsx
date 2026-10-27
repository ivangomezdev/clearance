'use client';
import {useEffect,useRef,useState} from 'react';
import {MessageCircle,RefreshCw,ArrowDown,LockKeyhole,X} from 'lucide-react';
import type {Deal} from '../lib/deals';
type Channel={id:string;name:string};
type Reply={error?:string;retryAfter?:number;channels?:Channel[];data?:Deal[];channel?:Channel;nextBefore?:string|null;scanned?:number;warning?:string|null};
export function DiscordSource({count,onPage,onClear}:{count:number;onPage:(data:Deal[],channelId:string,replace:boolean)=>void;onClear:()=>void}){
 const [key,setKey]=useState(''),[channels,setChannels]=useState<Channel[]>([]),[selected,setSelected]=useState(''),[cursors,setCursors]=useState<Record<string,string|null>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState(''),[retryAt,setRetryAt]=useState(0),[now,setNow]=useState(Date.now());
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 useEffect(()=>{if(!retryAt)return;const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[retryAt]);
 const wait=Math.max(0,Math.ceil((retryAt-now)/1000));
 async function load(older=false){
  if(busy||wait)return;const c=new AbortController();controller.current=c;setBusy(true);setError('');setInfo('');
  const call=async(body:unknown)=>{const r=await fetch('/api/discord',{method:'POST',headers:{'Content-Type':'application/json','x-discord-access-key':key},body:JSON.stringify(body),signal:c.signal});const j=await r.json() as Reply;if(!r.ok){if(r.status===429){setNow(Date.now());setRetryAt(Date.now()+Math.max(1,j.retryAfter||60)*1000);}throw Error(j.error||`Error HTTP ${r.status}`);}return j;};
  try{
   const available=(await call({action:'channels'})).channels||[];if(c.signal.aborted)return;
   setChannels(prev=>available.map(ch=>prev.find(p=>p.id===ch.id)||ch));
   const targets=available.filter(ch=>(!selected||ch.id===selected)&&(!older||cursors[ch.id]));
   if(!targets.length){setInfo('No hay más páginas pendientes para estos canales.');return;}
   let scanned=0,received=0;const warnings:string[]=[];
   for(const ch of targets){
    setInfo(`Leyendo ${channels.find(item=>item.id===ch.id)?.name||ch.id}…`);
    const j=await call({action:'messages',channelId:ch.id,...(older?{before:cursors[ch.id]}:{})});if(c.signal.aborted)return;
    if(!j.channel||!Array.isArray(j.data))throw Error('La respuesta de Discord no tiene el formato esperado.');
    onPage(j.data,ch.id,!older);setChannels(prev=>prev.map(item=>item.id===ch.id?j.channel!:item));setCursors(prev=>({...prev,[ch.id]:j.nextBefore||null}));scanned+=j.scanned||0;received+=j.data.length;if(j.warning)warnings.push(j.warning);
   }
   setInfo(`${scanned} mensajes revisados · ${received} enlaces de ofertas recibidos. ${warnings.join(' ')}`);
  }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'No se pudo consultar Discord.');}
  finally{if(!c.signal.aborted)setBusy(false);}
 }
 const hasMore=Object.entries(cursors).some(([id,cursor])=>cursor&&(!selected||id===selected));
 return <section className="discord-panel" aria-label="Fuente Discord"><div className="discord-heading"><span className="discord-logo"><MessageCircle size={23}/></span><div><h2>Discord <span>Profit Central</span></h2><p>Ofertas de tus canales autorizados, con enlace al mensaje original.</p></div><a href="https://discord.com/invite/profitcentral" target="_blank" rel="noopener noreferrer">Abrir servidor ↗</a></div>
 <div className="discord-controls"><label><span><LockKeyhole size={12}/> Clave de acceso al dashboard</span><input type="password" autoComplete="off" placeholder="Clave privada de esta integración" value={key} onChange={e=>setKey(e.target.value)} disabled={busy}/></label><label><span>Canal</span><select aria-label="Canal de Discord" value={selected} onChange={e=>setSelected(e.target.value)} disabled={busy}><option value="">Todos los canales configurados</option>{channels.map(ch=><option value={ch.id} key={ch.id}>#{ch.name}</option>)}</select></label><button className="primary" disabled={!key||busy||wait>0} onClick={()=>load()}><RefreshCw size={14} className={busy?'spin':''}/>{busy?'Leyendo canales':wait?`Esperar ${wait} s`:'Conectar y cargar'}</button></div>
 <p className="discord-help">La clave es la de esta integración, no tu contraseña ni un token de Discord. El bot se configura en el servidor. Solo se importan mensajes con enlaces externos de los canales seleccionados. Los precios y la vigencia se consultan en la oferta.</p>
 <div className="discord-status" role="status">{error?<span className="discord-error">{error}</span>:info||'Pendiente de conectar un bot autorizado. No se han consultado mensajes del servidor.'}</div>
 <div className="discord-actions"><span>{count.toLocaleString('es-MX')} ofertas de Discord en esta sesión</span>{hasMore&&<button disabled={busy||!key||wait>0} onClick={()=>load(true)}><ArrowDown size={14}/> Cargar mensajes anteriores</button>}{count>0&&<button disabled={busy} onClick={()=>{onClear();setKey('');setCursors({});setChannels([]);setSelected('');setInfo('Acceso y datos de Discord retirados de esta sesión.');setError('');}}><X size={13}/> Olvidar acceso y datos</button>}</div>
 <details><summary>Cómo activar la integración</summary><ol><li>Un administrador debe añadir un bot al servidor y permitirle ver los canales de ofertas y leer su historial, con Message Content Intent habilitado.</li><li>En Vercel, configurar DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DISCORD_CHANNEL_IDS y DISCORD_DASHBOARD_KEY; después, desplegar de nuevo.</li><li>Introducir aquí únicamente DISCORD_DASHBOARD_KEY. Los IDs y pasos completos están en el README del repositorio.</li></ol><p>La carga es manual y paginada, de hasta 100 mensajes por canal en cada solicitud. No hay capturas automáticas con la web cerrada.</p></details></section>;
}
