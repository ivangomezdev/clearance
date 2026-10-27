import {createHash,timingSafeEqual} from 'node:crypto';
import {snowflake} from './discord-messages';

export function discordConfig(env:Record<string,string|undefined>){
 const token=env.DISCORD_BOT_TOKEN?.trim(),guildId=env.DISCORD_GUILD_ID?.trim(),accessKey=env.DISCORD_DASHBOARD_KEY;
 const channelIds=[...new Set((env.DISCORD_CHANNEL_IDS||'').split(',').map(s=>s.trim()).filter(Boolean))];
 if(!token||!guildId||!accessKey||!channelIds.length)return null;
 if(!snowflake(guildId)||channelIds.some(id=>!snowflake(id))||channelIds.length>20||accessKey.length<32)throw Error('Revisa DISCORD_GUILD_ID, DISCORD_CHANNEL_IDS (hasta 20 IDs) y DISCORD_DASHBOARD_KEY (mínimo 32 caracteres).');
 return {token,guildId,accessKey,channelIds};
}
export function validAccess(provided:string|null,expected:string){if(!provided||provided.length>1024)return false;return timingSafeEqual(createHash('sha256').update(provided).digest(),createHash('sha256').update(expected).digest());}
export class DiscordError extends Error{constructor(public status:number,message:string,public retryAfter?:number){super(message);}}
export async function discordGet<T>(path:string,token:string):Promise<T>{
 let r:Response;try{r=await fetch(`https://discord.com/api/v10${path}`,{headers:{Authorization:`Bot ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(12000),cache:'no-store'});}catch{throw new DiscordError(502,'No se pudo conectar con Discord.');}
 if(!r.ok){
  if(r.status===429){const j=await r.json() as {retry_after?:number};throw new DiscordError(429,'Discord solicita una pausa antes de continuar.',Math.max(1,Math.ceil(Number(j.retry_after)||Number(r.headers.get('retry-after'))||60)));}
  throw new DiscordError(r.status===401?502:r.status,r.status===401?'El token del bot no es válido.':r.status===403?'El bot no tiene acceso a este canal o a su historial.':r.status===404?'Discord no encuentra el canal configurado.':`Discord respondió HTTP ${r.status}.`);
 }
 return await r.json() as T;
}
