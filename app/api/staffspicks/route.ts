import {CE_ORIGIN,parseStaffDetail,parseStaffPage,staffSession} from '../../../lib/staffspicks';
import {clearanceToken} from '../../../lib/staffspicks-session';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const headers:Record<string,string>={'Cache-Control':'private, no-store'};
 const reply=(data:unknown,status=200)=>Response.json(data,{status,headers});
 const q=new URL(request.url).searchParams,slug=q.get('slug');
 let token:string|undefined;
 try{token=await clearanceToken();}catch(e){return reply({error:e instanceof Error?e.message:'No se pudo renovar la sesión.',session:{status:'invalid'}},401);}
 const session=staffSession(token);
 if(session.status==='expired'||session.status==='invalid')return reply({error:session.status==='expired'?'La sesión de Clearance Explorer caducó. Actualiza CE_ACCESS_TOKEN en el servidor.':'La sesión configurada no es válida.',session},401);
 let path:string,page=1;
 if(slug){
  if(slug.length>220||! /^(?:[a-z0-9]+-)*[a-f0-9]{8}$/.test(slug))return reply({error:'Oferta inválida.'},400);
  path=`/u/${slug}`;
 }else{
  page=Number(q.get('page')||1);const sort=q.get('sort')||'recent';
  if(!Number.isInteger(page)||page<1||page>10000||!['recent','discount_desc','price_asc','price_desc'].includes(sort))return reply({error:'Paginación u orden inválidos.'},400);
  if(!token&&page>1)return reply({error:'Conecta la sesión para cargar más ofertas.',session},401);
  const params=new URLSearchParams({source_type:'user',sort,page:String(page),limit:'12'});
  const retailer=q.get('retailer');if(retailer){if(retailer.length>80)return reply({error:'Tienda inválida.'},400);params.set('retailer',retailer);}
  const min=q.get('min_discount');if(min){if(!/^\d{1,3}$/.test(min)||Number(min)>100)return reply({error:'Descuento inválido.'},400);params.set('min_discount',min);}
  path=`/api/deals?${params}`;
 }
 try{
  const upstream=await fetch(CE_ORIGIN+path,{headers:{Accept:slug?'text/html':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
  if(upstream.status===429){const retry=upstream.headers.get('retry-after');if(retry)headers['Retry-After']=retry;return reply({error:'El origen limitó las solicitudes. Espera antes de reintentar.',session},429);}
  if(upstream.status===401||upstream.status===403)return reply({error:'Clearance Explorer rechazó la sesión o el acceso. Actualiza la sesión del servidor.',session},upstream.status);
  if(!upstream.ok)return reply({error:`No se pudo cargar la oferta (HTTP ${upstream.status}).`,session},502);
  if(slug){const html=await upstream.text();if(html.length>3_000_000)throw Error();return reply({deal:parseStaffDetail(html,slug.slice(-8)),session});}
  const result=parseStaffPage(await upstream.json(),page);
  // Guest preview may say has_more even though page 2 requires authentication.
  return reply({...result,hasMore:!!token&&result.hasMore,upstreamHasMore:result.hasMore,limited:!token,session});
 }catch{return reply({error:'No se pudo leer Clearance Explorer. Conservamos las ofertas recibidas; vuelve a intentar.',session},502);}
}
