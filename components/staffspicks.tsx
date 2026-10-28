'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowUpRight,Bookmark,RefreshCw,Search,Star,X} from 'lucide-react';
import type {StaffPick,StaffSession} from '../lib/staffspicks';
const money=(n:number|null)=>n===null?'Consultar precio':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
const date=(s:string)=>new Date(s).toLocaleString('es-MX',{timeZone:'America/Cancun',dateStyle:'medium',timeStyle:'short'});
const FAVORITES='staffspicks-favorites';
type Page={deals:StaffPick[];page:number;hasMore:boolean;limited:boolean;session:StaffSession;error?:string};

export function StaffPicks(){
 const [items,setItems]=useState<StaffPick[]>([]),[sort,setSort]=useState('recent'),[store,setStore]=useState(''),[min,setMin]=useState('0'),[search,setSearch]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[hasMore,setHasMore]=useState(true),[limited,setLimited]=useState(false),[session,setSession]=useState<StaffSession|null>(null),[pages,setPages]=useState(0),[retryAt,setRetryAt]=useState(0),[clock,setClock]=useState(0);
 const [favorites,setFavorites]=useState<string[]>([]),[savedOnly,setSavedOnly]=useState(false);
 const [selected,setSelected]=useState<StaffPick|null>(null),[detail,setDetail]=useState<StaffPick|null>(null),[detailError,setDetailError]=useState(''),[detailBusy,setDetailBusy]=useState(false);
 const observerTarget=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDialogElement>(null),abort=useRef<AbortController|null>(null),generation=useRef(0),inFlight=useRef(false),nextPage=useRef(1),lastStarted=useRef(0),backoff=useRef(0);
 useEffect(()=>{try{const v=JSON.parse(localStorage.getItem(FAVORITES)||'[]');if(Array.isArray(v))setFavorites(v.filter(x=>typeof x==='string'));}catch{}},[]);
 useEffect(()=>{if(!retryAt)return;const t=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(t);},[retryAt]);
 const load=useCallback(async(page:number,gen:number)=>{
  if(inFlight.current)return;if(Date.now()<backoff.current){setError('Espera a que termine el límite del origen antes de volver a cargar.');return;}inFlight.current=true;setBusy(true);setError('');
  const c=new AbortController();abort.current=c;
  try{
   const wait=Math.max(0,1250-(Date.now()-lastStarted.current));
   if(wait)await new Promise<void>(resolve=>{const t=setTimeout(resolve,wait);c.signal.addEventListener('abort',()=>{clearTimeout(t);resolve();},{once:true});});
   if(c.signal.aborted||gen!==generation.current)return;
   lastStarted.current=Date.now();
   const params=new URLSearchParams({page:String(page),sort,min_discount:min});if(store)params.set('retailer',store);
   const r=await fetch(`/api/staffspicks?${params}`,{signal:c.signal,cache:'no-store'}),data=await r.json() as Page;
   if(c.signal.aborted||gen!==generation.current)return;
   if(data.session)setSession(data.session);
   if(r.status===429){const value=r.headers.get('retry-after');const delay=value&&Number.isFinite(Number(value))?Number(value)*1000:value?Date.parse(value)-Date.now():65000;backoff.current=Date.now()+Math.max(65000,Number.isFinite(delay)?delay:65000);setRetryAt(backoff.current);setClock(Date.now());}
   if(!r.ok)throw Error(data.error||'No se pudo cargar la página.');
   if(!Array.isArray(data.deals)||data.page!==page||typeof data.hasMore!=='boolean')throw Error('El formato de paginación cambió.');
   if(!data.deals.length&&data.hasMore)throw Error('El origen devolvió una página vacía con más resultados pendientes. Reintenta más tarde.');
   setItems(old=>{const map=new Map((page===1?[]:old).map(d=>[d.id,d]));data.deals.forEach(d=>map.set(d.id,d));return [...map.values()];});
   nextPage.current=page+1;setPages(page);setHasMore(data.hasMore);setLimited(data.limited);setRetryAt(0);
  }catch(e){if(!c.signal.aborted&&gen===generation.current)setError(e instanceof Error?e.message:'Error de conexión.');}
  finally{if(gen===generation.current){inFlight.current=false;setBusy(false);}}
 },[sort,store,min]);
 const reset=useCallback(()=>{abort.current?.abort();generation.current++;inFlight.current=false;nextPage.current=1;setItems([]);setPages(0);setError('');setHasMore(true);setLimited(false);setSession(null);void load(1,generation.current);},[load]);
 useEffect(()=>{reset();return()=>{generation.current++;abort.current?.abort();inFlight.current=false;};},[reset]);
 const blocked=retryAt>clock;
 useEffect(()=>{const el=observerTarget.current;if(!el||busy||error||!hasMore||limited||blocked)return;const observer=new IntersectionObserver(entries=>{if(entries[0]?.isIntersecting)void load(nextPage.current,generation.current);},{rootMargin:'300px'});observer.observe(el);return()=>observer.disconnect();},[busy,error,hasMore,limited,blocked,load]);
 useEffect(()=>{
  if(!selected){dialog.current?.close();return;}
  dialog.current?.showModal();setDetail(null);setDetailError('');setDetailBusy(true);const c=new AbortController();
  fetch(`/api/staffspicks?slug=${encodeURIComponent(selected.slug)}`,{signal:c.signal}).then(async r=>{const data=await r.json() as {deal?:StaffPick;error?:string};if(c.signal.aborted)return;if(!r.ok||!data.deal)throw Error(data.error||'No se pudo cargar el detalle.');setDetail(data.deal);}).catch(e=>{if(!c.signal.aborted)setDetailError(e.message);}).finally(()=>{if(!c.signal.aborted)setDetailBusy(false);});
  return()=>c.abort();
 },[selected]);
 const toggle=(id:string)=>setFavorites(old=>{const v=old.includes(id)?old.filter(x=>x!==id):[...old,id];try{localStorage.setItem(FAVORITES,JSON.stringify(v));}catch{}return v;});
 const visible=items.filter(d=>(!savedOnly||favorites.includes(d.id))&&`${d.title} ${d.description} ${d.retailer}`.toLowerCase().includes(search.trim().toLowerCase()));
 const shown=detail||selected;
 return <section className="staffspicks" aria-label="Staff Picks">
  <div className="title-row"><div><div className="eyebrow"><Star size={14}/> STAFFSPICKS · CLEARANCE EXPLORER</div><h1>Elegidas por su equipo.</h1><p className="subtitle">Ofertas de Staff Picks. Baja para descubrir más y abre una tarjeta para ver sus condiciones.</p></div><button className="primary sync" disabled={busy||blocked} onClick={reset}><RefreshCw size={16} className={busy?'spin':''}/>Actualizar</button></div>
  <div className="session-line" role="status"><span>{!session?'Conectando con Clearance Explorer…':session.status==='public'?'Vista pública limitada · falta conectar la sesión en el servidor':session.status==='configured'?'Sesión del servidor configurada':session.status==='expired'?'La sesión caducó':'Sesión inválida'}</span>{session?.expiresAt&&<span>Vence: {date(session.expiresAt)} (Cancún)</span>}</div>
  <div className="filter-bar"><div className="search-box"><Search size={18}/><input aria-label="Buscar en Staff Picks" placeholder="Buscar entre las ofertas cargadas…" value={search} onChange={e=>setSearch(e.target.value)}/></div><select aria-label="Tienda de Staff Picks" value={store} onChange={e=>setStore(e.target.value)}><option value="">Todas las tiendas</option>{['Amazon','Best Buy','Home Depot',"Lowe's",'Walmart','Target','Woot',"Sam's Club"].map(s=><option key={s}>{s}</option>)}</select><select aria-label="Descuento de Staff Picks" value={min} onChange={e=>setMin(e.target.value)}><option value="0">Cualquier descuento</option><option value="50">50% o más</option><option value="70">70% o más</option><option value="90">90% o más</option></select><select aria-label="Ordenar Staff Picks" value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Más recientes</option><option value="discount_desc">Mayor descuento</option><option value="price_asc">Menor precio</option><option value="price_desc">Mayor precio</option></select></div>
  <div className="results-toolbar"><span><strong>{items.length}</strong> ofertas recibidas · {pages} páginas{search||savedOnly?` · ${visible.length} coinciden`:''}</span><label><input type="checkbox" checked={savedOnly} onChange={e=>setSavedOnly(e.target.checked)}/> Solo guardadas</label></div>
  {error&&<div className="error-banner" role="alert"><span>{error} Se conservan las ofertas recibidas.</span></div>}
  <div className="deal-grid">{visible.map(d=><article className="deal-card" key={d.id}><div className="product-image"><button className="image-open" aria-label={`Ver detalle: ${d.title}`} onClick={()=>setSelected(d)}>{d.imageUrl?<img src={d.imageUrl} alt={d.title} loading="lazy"/>:<Star size={48}/>}</button><span className={d.expired?'discount-badge expired':'discount-badge'}>{d.expired?'Vencida':d.discount?`−${d.discount}%`:'Staff Pick'}</span><button className={favorites.includes(d.id)?'save saved':'save'} aria-label={favorites.includes(d.id)?`Quitar favorito: ${d.title}`:`Guardar: ${d.title}`} aria-pressed={favorites.includes(d.id)} onClick={()=>toggle(d.id)}><Bookmark size={17} fill={favorites.includes(d.id)?'currentColor':'none'}/></button></div><div className="card-body"><div className="card-meta"><span>{d.retailer}</span><small>{new Date(d.foundAt).toLocaleDateString('es-MX',{timeZone:'America/Cancun'})}</small></div><button className="product-title" onClick={()=>setSelected(d)}>{d.title}</button><div className="prices"><strong>{d.price===0?'Ver condiciones':money(d.price)}</strong>{d.originalPrice!==null&&d.price!==null&&d.originalPrice>d.price&&<del>{money(d.originalPrice)}</del>}<span>USD</span></div><div className="card-footer"><span className="deal-tag">{d.badge||'Staff Pick'}</span><button onClick={()=>setSelected(d)}>Ver oferta <ArrowUpRight size={15}/></button></div></div></article>)}</div>
  {!busy&&!visible.length&&<div className="empty-state"><Search size={32}/><h2>{items.length?'No hay coincidencias entre las ofertas cargadas':'Todavía no hay ofertas'}</h2><p>{items.length?'Puedes cargar más ofertas o cambiar los filtros.':'Actualiza para volver a consultar la fuente.'}</p></div>}
  <div ref={observerTarget} className="staff-load" aria-live="polite">{busy?<span><RefreshCw size={16} className="spin"/> Cargando página {nextPage.current}…</span>:limited?<p>Vista pública limitada a {items.length} ofertas recibidas. Para seguir cargando se necesita una sesión válida del servidor.</p>:hasMore?<button className="primary" disabled={blocked} onClick={()=>void load(nextPage.current,generation.current)}>{blocked?`Reintentar en ${Math.max(1,Math.ceil((retryAt-clock)/1000))} s`:error?'Reintentar la página':'Cargar más ofertas'}</button>:<p>Has llegado al final de las ofertas disponibles con estos filtros.</p>}</div>
  <p className="footnote">Búsqueda y guardadas se aplican a las ofertas cargadas. Precios y descuentos son los campos del origen; pueden diferir del título o requerir cupón. Confirma el precio final en la tienda. <a href="https://clearanceexplorer.com/staff-picks" target="_blank" rel="noopener noreferrer">Ver fuente</a></p>
  <dialog ref={dialog} className="deal-dialog" onCancel={()=>setSelected(null)} onClick={e=>{if(e.target===e.currentTarget)setSelected(null);}}>{shown&&<><button className="dialog-close" aria-label="Cerrar detalle de Staff Picks" onClick={()=>setSelected(null)}><X size={21}/></button><div className="detail-grid"><div className="detail-image">{shown.imageUrl&&<img src={shown.imageUrl} alt={shown.title}/>}</div><div className="detail-info"><div className="eyebrow">STAFF PICKS · {shown.retailer}</div><h2>{shown.title}</h2><div className="detail-price"><strong>{shown.price===0?'Ver condiciones':money(shown.price)}</strong>{shown.originalPrice!==null&&shown.price!==null&&shown.originalPrice>shown.price&&<del>{money(shown.originalPrice)}</del>}</div><p className="detail-description staff-description">{shown.description||'Consulta las condiciones en la fuente.'}</p>{shown.promoCode&&<p className="coupon">Cupón: <strong>{shown.promoCode}</strong></p>}{detailBusy?<p role="status">Cargando detalle y enlace de compra…</p>:shown.buyUrl?<a className="primary buy" href={shown.buyUrl} target="_blank" rel="noopener noreferrer sponsored">Ir a comprar <ArrowUpRight size={18}/></a>:<a className="primary buy" href={shown.sourceUrl} target="_blank" rel="noopener noreferrer">Ver condiciones en la fuente <ArrowUpRight size={18}/></a>}{detailError&&<p className="redirect-warning" role="alert">{detailError}</p>}<p className="buy-note">El enlace original puede incluir afiliación. Precio y disponibilidad finales en el comercio.</p><a href={shown.sourceUrl} target="_blank" rel="noopener noreferrer">Ver publicación original</a></div></div><div className="detail-bottom"><div><span>PUBLICADA</span><strong>{date(shown.foundAt)} (Cancún)</strong></div><button onClick={()=>toggle(shown.id)}><Bookmark size={16}/>{favorites.includes(shown.id)?'Guardada':'Guardar oferta'}</button></div></>}</dialog>
 </section>;
}
