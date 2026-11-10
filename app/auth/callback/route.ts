import {NextResponse} from 'next/server';
import {accountClient, accountConfigured} from '../../../lib/account-server';
import {accountOrigin} from '../../../lib/account';

export async function GET(request: Request) {
  const url = new URL(request.url), origin = accountOrigin(request), code = url.searchParams.get('code');
  if (accountConfigured() && code) {
    try {
      const {error} = await (await accountClient(request)).auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL('/', origin), {headers: {'Cache-Control': 'private, no-store'}});
    } catch {}
  }
  return NextResponse.redirect(new URL('/login?confirmation=failed', origin), {headers: {'Cache-Control': 'private, no-store'}});
}
