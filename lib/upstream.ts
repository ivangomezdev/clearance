import {sessionAccess} from './hc-session';
const ORIGIN='https://api.hiddenclearances.com';
export async function upstream(path:string) {
  const start=Date.now();
  try {
    const session=sessionAccess(process.env.HC_ACCESS_TOKEN);
    const headers:Record<string,string>={Accept:'application/json'};
    if(session.token)headers.Authorization=`Bearer ${session.token}`;
    let r=await fetch(ORIGIN+path,{headers,signal:AbortSignal.timeout(20000),cache:'no-store'});
    if(r.status===401&&session.token){session.info={status:'rejected',expiresAt:session.info.expiresAt};r=await fetch(ORIGIN+path,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000),cache:'no-store'});}
    const body=await r.text();
    let data;try{data=JSON.parse(body);}catch{return Response.json({error:'La API devolvió una respuesta no válida.'},{status:502});}
    return Response.json({...data,session:session.info},{status:r.status,headers:{'Cache-Control':'private, no-store','X-Upstream-Duration':String(Date.now()-start),'X-Upstream-Path':path,...(r.headers.get('retry-after')?{'Retry-After':r.headers.get('retry-after')!}:{})}});
  }catch{return Response.json({error:'No se pudo conectar con Hidden Clearances. Vuelve a intentar.'},{status:502});}
}
