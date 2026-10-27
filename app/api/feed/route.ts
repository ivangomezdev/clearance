import {upstream} from '../../../lib/upstream';
import {feedDeals,FeedItem} from '../../../lib/feed';
export async function GET(request:Request){
 const page=Number(new URL(request.url).searchParams.get('page')||1);
 if(!Number.isInteger(page)||page<1||page>200)return Response.json({error:'Página inválida'},{status:400});
 const response=await upstream(`/api/v1/feed?limit=50&page=${page}`);
 const body=await response.json() as {data?:FeedItem[];session?:unknown;pagination?:unknown;error?:string;success?:boolean};
 if(!response.ok||!Array.isArray(body.data))return Response.json(body,{status:response.status,headers:response.headers});
 return Response.json({...body,data:feedDeals(body.data),received:body.data.length,lockedSkipped:body.data.filter(d=>d.locked).length},{status:response.status,headers:response.headers});
}
