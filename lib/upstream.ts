const ORIGIN='https://api.hiddenclearances.com';
export async function upstream(path:string) {
  const start=Date.now();
  try {
    const r=await fetch(ORIGIN+path,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});
    const body=await r.text();
    let data;try{data=JSON.parse(body);}catch{return Response.json({error:'La API devolvió una respuesta no válida.'},{status:502});}
    return Response.json(data,{status:r.status,headers:{'Cache-Control':r.ok?'private, max-age=30':'no-store','X-Upstream-Duration':String(Date.now()-start),'X-Upstream-Path':path,...(r.headers.get('retry-after')?{'Retry-After':r.headers.get('retry-after')!}:{})}});
  }catch{return Response.json({error:'No se pudo conectar con Hidden Clearances. Vuelve a intentar.'},{status:502});}
}
