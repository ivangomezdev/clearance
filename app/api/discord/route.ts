import {discordConfig,validAccess,discordGet,DiscordError} from '../../../lib/discord-api';
import {DiscordChannel,DiscordMessage,messageDeals,snowflake} from '../../../lib/discord-messages';
export const runtime='nodejs';
export const maxDuration=60;
const json=(body:unknown,status=200,headers:Record<string,string>={})=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',...headers}});
export async function POST(request:Request){
 try{
  const config=discordConfig(process.env);
  if(!config)return json({error:'Discord todavía no está configurado. Añade el bot autorizado, el servidor, los canales y la clave de acceso en las variables del servidor.',code:'NOT_CONFIGURED'},503);
  if(!validAccess(request.headers.get('x-discord-access-key'),config.accessKey))return json({error:'Introduce la clave de acceso a Discord de este dashboard.',code:'ACCESS_REQUIRED'},401);
  let body:{action?:string;channelId?:string;before?:string};try{body=await request.json() as typeof body;}catch{return json({error:'Solicitud inválida.'},400);}
  if(!body||typeof body!=='object')return json({error:'Solicitud inválida.'},400);
  if(body.action==='channels')return json({channels:config.channelIds.map(id=>({id,name:id})),guildId:config.guildId});
  if(body.action!=='messages'||!body.channelId||!config.channelIds.includes(body.channelId)||(body.before!==undefined&&!snowflake(body.before)))return json({error:'Canal o cursor no autorizado.'},400);
  const channel=await discordGet<DiscordChannel>(`/channels/${body.channelId}`,config.token);
  if(channel.guild_id!==config.guildId||channel.id!==body.channelId||![0,5,10,11,12].includes(channel.type))return json({error:'El canal no pertenece al servidor configurado o no es un canal de texto compatible.'},403);
  const messages=await discordGet<DiscordMessage[]>(`/channels/${channel.id}/messages?limit=100${body.before?`&before=${body.before}`:''}`,config.token);
  if(!Array.isArray(messages))throw new DiscordError(502,'Discord devolvió un formato inesperado.');
  const data=messages.flatMap(m=>messageDeals(m,channel));
  const last=messages.at(-1)?.id;
  return json({data,channel:{id:channel.id,name:channel.name},scanned:messages.length,nextBefore:messages.length===100&&snowflake(last)?last:null,warning:messages.length&&!messages.some(m=>m.content||m.embeds?.length||m.attachments?.length)?'Los mensajes no incluyen contenido. Comprueba MESSAGE_CONTENT y READ_MESSAGE_HISTORY del bot.':null});
 }catch(e){if(e instanceof DiscordError)return json({error:e.message,retryAfter:e.retryAfter},e.status,e.retryAfter?{'Retry-After':String(e.retryAfter)}:{});return json({error:e instanceof Error&&e.message.startsWith('Revisa DISCORD_')?e.message:'No se pudo consultar Discord.'},500);}
}
