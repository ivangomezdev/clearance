import {hcSessionForRequest} from './hc-session-service';
const ORIGIN='https://api.hiddenclearances.com';
export async function upstream(path:string, request:Request) {
  const start=Date.now();
  const session=await hcSessionForRequest(request);
  try {
    const headers:Record<string,string>={Accept:'application/json'};
    if(session.token)headers.Authorization=`Bearer ${session.token}`;
    let r=await fetch(ORIGIN+path,{headers,signal:AbortSignal.timeout(20000),cache:'no-store',redirect:'error'});
    if(r.status===401&&session.token&&await session.refresh())r=await fetch(ORIGIN+path,{headers:{Accept:'application/json',Authorization:`Bearer ${session.token}`},signal:AbortSignal.timeout(20000),cache:'no-store',redirect:'error'});
    if(r.status===401){session.info={status:'rejected',expiresAt:session.info.expiresAt,renewable:session.info.renewable};r=await fetch(ORIGIN+path,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000),cache:'no-store',redirect:'error'});}
    const body=await r.text();
    let data;try{data=JSON.parse(body);}catch{return session.apply(Response.json({error:'La API devolvió una respuesta no válida.'},{status:502}));}
    return session.apply(Response.json({...data,session:session.info},{status:r.status,headers:{'Cache-Control':'private, no-store','X-Upstream-Duration':String(Date.now()-start),'X-Upstream-Path':path,...(r.headers.get('retry-after')?{'Retry-After':r.headers.get('retry-after')!}:{})}}));
  }catch{return session.apply(Response.json({error:'No se pudo conectar con la cuenta de inventario. Vuelve a intentar.'},{status:502}));}
}
