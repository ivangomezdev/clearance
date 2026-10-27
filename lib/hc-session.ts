const COOKIE_NAME='sb-cdqqxarqppyvctffzsax-auth-token';
const ISSUER='https://cdqqxarqppyvctffzsax.supabase.co/auth/v1';
export type SessionInfo={status:'public'|'active'|'expired'|'invalid'|'rejected';expiresAt?:string};
export function sessionAccess(token:string|undefined,now=Date.now()):{token?:string;info:SessionInfo}{
 if(!token)return {info:{status:'public'}};
 try{const parts=token.trim().split('.');if(parts.length!==3)throw Error();const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString());if(claims.iss!==ISSUER||typeof claims.exp!=='number'||!Number.isFinite(claims.exp))throw Error();const expiresAt=new Date(claims.exp*1000).toISOString();if(claims.exp*1000<=now)return {info:{status:'expired',expiresAt}};return {token:token.trim(),info:{status:'active',expiresAt}};}catch{return {info:{status:'invalid'}};}
}
// Used during setup only. Do not forward analytics cookies or refresh tokens.
export function accessTokenFromCookie(raw:string):string{
 const pairs=raw.trim().replace(/^cookie\s*:\s*/i,'').split(';').map(s=>{const i=s.indexOf('=');return [s.slice(0,i).trim(),s.slice(i+1).trim()] as const;});
 const single=pairs.find(([k])=>k===COOKIE_NAME)?.[1];
 const chunks=pairs.filter(([k])=>k.startsWith(COOKIE_NAME+'.')).map(([k,v])=>({index:Number(k.slice(COOKIE_NAME.length+1)),value:v})).sort((a,b)=>a.index-b.index);
 if(!single&&(!chunks.length||chunks.some((c,i)=>c.index!==i)))throw Error('La cookie de Hidden Clearances está incompleta.');
 try{const value=decodeURIComponent(single||chunks.map(c=>c.value).join(''));const session=JSON.parse(value.startsWith('base64-')?Buffer.from(value.slice(7),'base64url').toString():value);if(typeof session.access_token!=='string'||sessionAccess(session.access_token).info.status==='invalid')throw Error();return session.access_token;}catch{throw Error('No se pudo interpretar la sesión de Hidden Clearances.');}
}
