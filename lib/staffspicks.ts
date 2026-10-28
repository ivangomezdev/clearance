export const CE_ORIGIN = 'https://clearanceexplorer.com';
export type StaffPick = {
 id:string; slug:string; title:string; description:string; retailer:string; imageUrl:string|null;
 originalPrice:number|null; price:number|null; discount:number; foundAt:string; expired:boolean;
 promoCode:string|null; sourceUrl:string; buyUrl:string|null; badge:string|null;
};
export type StaffSession = {status:'public'|'configured'|'expired'|'invalid'; expiresAt?:string};
type RecordValue=Record<string,unknown>;
function record(v:unknown):v is RecordValue{return !!v&&typeof v==='object'&&!Array.isArray(v);}
const string=(v:unknown)=>typeof v==='string'?v:'';
export function httpsUrl(v:unknown){try{const u=new URL(string(v));return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function amount(v:unknown){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;}
export function staffSession(token:string|undefined,now=Date.now()):StaffSession{
 if(!token)return {status:'public'};
 try{const parts=token.trim().split('.');if(parts.length!==3)throw Error();const p=JSON.parse(Buffer.from(parts[1],'base64url').toString());
 if(p.iss!=='https://clerk.clearanceexplorer.com'||typeof p.exp!=='number'||!Number.isFinite(p.exp))throw Error();
 return {status:p.exp*1000<=now?'expired':'configured',expiresAt:new Date(p.exp*1000).toISOString()};
 }catch{return {status:'invalid'};}
}
export function normalizeStaffPick(v:unknown):StaffPick{
 if(!record(v)||!/^\w{8}-[\da-f-]{27}$/i.test(string(v.id))||!string(v.title)||!Number.isFinite(Date.parse(string(v.found_at)))||v.source_type!=='user')throw Error('Formato de oferta no válido.');
 const title=string(v.title),id=string(v.id);
 const words=title.replace(/\$\s?[\d.,]+/g,' ').replace(/[^a-zA-Z0-9\s]/g,' ').split(/\s+/).filter(Boolean).slice(0,4).join('-').toLowerCase();
 const slug=`${words?words+'-':''}${id.slice(0,8)}`;
 const badge=record(v.staff_badge)?[string(v.staff_badge.left),string(v.staff_badge.right)].filter(Boolean).join(' · '):null;
 const n=amount(v.discount_percent);
 return {id,slug,title,description:string(v.description_raw),retailer:string(v.retailer)||'Sin tienda indicada',imageUrl:httpsUrl(v.image_url),originalPrice:amount(v.original_price),price:amount(v.clearance_price),discount:Math.min(100,n??0),foundAt:string(v.found_at),expired:v.mod_marked_expired===true||v.status==='expired',promoCode:string(v.promo_code)||null,sourceUrl:`${CE_ORIGIN}/u/${slug}`,buyUrl:null,badge};
}
export function parseStaffPage(value:unknown,requested:number){
 if(!record(value)||!Array.isArray(value.deals)||value.page!==requested||!Number.isInteger(value.limit)||Number(value.limit)<1||Number(value.limit)>100||typeof value.has_more!=='boolean')throw Error('La paginación del origen cambió. Se detuvo la carga.');
 return {deals:value.deals.map(normalizeStaffPick),page:requested,limit:Number(value.limit),hasMore:value.has_more};
}
// Parse serialized data only. Never execute scripts or render upstream HTML.
export function parseStaffDetail(html:string,shortId:string){
 const chunks=[...html.matchAll(/self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g)].map(m=>{try{const p=JSON.parse(m[1]);return p[0]===1&&typeof p[1]==='string'?p[1]:'';}catch{return '';}}).join('');
 function visit(v:unknown):{deal:StaffPick;buyUrl:string|null}|null{
  if(Array.isArray(v)){for(const child of v){const result=visit(child);if(result)return result;}}
  else if(record(v)){
   if(record(v.deal)&&string(v.deal.id).slice(0,8)===shortId&&'viewDealUrl' in v)return {deal:normalizeStaffPick(v.deal),buyUrl:httpsUrl(v.viewDealUrl)};
   for(const child of Object.values(v)){const result=visit(child);if(result)return result;}
  }return null;
 }
 for(const line of chunks.split('\n')){const i=line.indexOf(':');if(i<0)continue;try{const result=visit(JSON.parse(line.slice(i+1)));if(result)return {...result.deal,buyUrl:result.buyUrl};}catch{}}
 throw Error('No se pudo interpretar el detalle de la oferta.');
}
