import {CE_ORIGIN,staffSession} from './staffspicks';
// Server-only session renewal. Never import this module into a client component.
const CLERK_ORIGIN='https://clerk.clearanceexplorer.com';
let cached:{key:string;token:string;expires:number}|undefined;
let pending:{key:string;promise:Promise<string>}|undefined;
export async function clearanceToken():Promise<string|undefined>{
 const client=process.env.CE_CLIENT_TOKEN?.trim(),id=process.env.CE_SESSION_ID?.trim();
 if(!client&&!id)return process.env.CE_ACCESS_TOKEN?.trim();
 if(!client||!id||!/^sess_[a-zA-Z0-9]+$/.test(id)||client.length>16000||/[\s;,\r\n]/.test(client))throw Error('Configura CE_CLIENT_TOKEN y CE_SESSION_ID con la sesión de Clearance Explorer.');
 const key=client+':'+id;
 if(cached?.key===key&&cached.expires>Date.now()+10000)return cached.token;
 if(pending?.key===key)return pending.promise;
 const promise=(async()=>{
  const r=await fetch(`${CLERK_ORIGIN}/v1/client/sessions/${encodeURIComponent(id)}/tokens`,{method:'POST',headers:{Cookie:`__client=${client}`,Origin:CE_ORIGIN,Referer:CE_ORIGIN+'/',Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:'',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('No se pudo renovar la sesión de Clearance Explorer. Vuelve a iniciar sesión y actualiza sus secretos.');
  const data=await r.json() as {jwt?:string;response?:{jwt?:string}};
  const token=data.response?.jwt||data.jwt,info=staffSession(token);
  if(typeof token!=='string'||info.status!=='configured'||!info.expiresAt)throw Error('Clerk no devolvió una sesión válida.');
  cached={key,token,expires:Date.parse(info.expiresAt)};return token;
 })();
 pending={key,promise};
 try{return await promise;}finally{if(pending?.promise===promise)pending=undefined;}
}
