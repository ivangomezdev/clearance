import {accountClient, accountConfigured, accountJson, readAccount} from '../../../lib/account-server';

export async function GET(request: Request) {
  if (!accountConfigured()) return accountJson({configured: false, user: null});
  try {return accountJson({configured: true, user: await readAccount(await accountClient(request))});}
  catch {return accountJson({error: 'No se pudo cargar tu cuenta. Vuelve a intentarlo.'}, 503);}
}
