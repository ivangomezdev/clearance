import {upstream} from '../../../lib/upstream';
export async function GET(request:Request) {
 const q=new URL(request.url).searchParams;const page=Number(q.get('page')||1);
 if(!Number.isInteger(page)||page<1||page>10000)return Response.json({error:'Página inválida'},{status:400});
 const active=q.get('activeOnly')!=='false';
 return upstream(`/api/v1/deals?limit=50&page=${page}&activeOnly=${active}`);
}
