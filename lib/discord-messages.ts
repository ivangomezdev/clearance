import type {Deal} from './deals';

export type DiscordMessage={id:string;channel_id:string;timestamp:string;content?:string;embeds?:{title?:string;description?:string;url?:string;image?:{url?:string};thumbnail?:{url?:string};fields?:{name:string;value:string}[]}[];attachments?:{url?:string;content_type?:string}[]};
export type DiscordChannel={id:string;name:string;guild_id:string;type:number};
export const snowflake=(v:unknown):v is string=>typeof v==='string'&&/^\d{17,20}$/.test(v);
export function externalUrl(value?:string){try{const u=new URL(value||'');if(u.protocol!=='https:')return null;const host=u.hostname.toLowerCase();if(['discord.com','discord.gg','discordapp.com','discordapp.net'].some(h=>host===h||host.endsWith('.'+h)))return null;return u.href;}catch{return null;}}
function imageUrl(value?:string){try{const u=new URL(value||'');return u.protocol==='https:'?u.href:undefined;}catch{return undefined;}}
function clean(text:string){return text.replace(/<@!?\d+>/g,'[mención]').replace(/<@&\d+>/g,'[rol]').replace(/<#\d+>/g,'[canal]').trim();}
export function messageDeals(message:DiscordMessage,channel:DiscordChannel):Deal[]{
 if(!snowflake(message.id)||message.channel_id!==channel.id||!Number.isFinite(Date.parse(message.timestamp)))return [];
 const content=clean(message.content||'');
 const contentLinks=[...content.matchAll(/https:\/\/[^\s<>]+/g)].map(m=>externalUrl(m[0].replace(/[).,;!\]]+$/g,''))).filter((u):u is string=>!!u);
 const offers=new Map<string,{title:string;description:string;image?:string}>();
 for(const e of message.embeds||[]){const url=externalUrl(e.url);if(!url)continue;offers.set(url,{title:clean(e.title||content.split('\n')[0]||'Oferta compartida en Discord').slice(0,240),description:clean([content,e.description,...(e.fields||[]).map(f=>`${f.name}: ${f.value}`)].filter(Boolean).join('\n\n')).slice(0,12000),image:imageUrl(e.image?.url||e.thumbnail?.url)});}
 for(const url of contentLinks){if(offers.has(url))continue;offers.set(url,{title:(content.split('\n').find(line=>line.replace(/https:\/\/\S+/g,'').trim())||'Oferta compartida en Discord').replace(/https:\/\/\S+/g,'').replace(/[*_~`]/g,'').trim().slice(0,240)||'Oferta compartida en Discord',description:content.slice(0,12000),image:imageUrl(message.attachments?.find(a=>a.content_type?.startsWith('image/'))?.url)});}
 return [...offers].map(([url,offer])=>({id:`discord:${channel.id}:${message.id}:${encodeURIComponent(url)}`,slug:message.id,title:offer.title,dealContent:offer.description,retailer:'discord',category:channel.name,dealLink:url,imageUrl:offer.image,originalPrice:null,discountedPrice:null,discountOff:null,isActive:true,createdAt:message.timestamp,source:'discord',messageUrl:`https://discord.com/channels/${channel.guild_id}/${channel.id}/${message.id}`,channelName:channel.name,channelId:channel.id,messageId:message.id,tags:[{slug:`discord-${channel.id}`,label:`#${channel.name}`}]}));
}
