import {upstream} from '../../../lib/upstream';
export async function GET(request:Request) {
 const id=new URL(request.url).searchParams.get('id')||'';
 if(!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id))return Response.json({error:'ID inválido'},{status:400});
 return upstream(`/api/v1/deals/${id}/redirect-url`);
}
