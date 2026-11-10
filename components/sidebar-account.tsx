'use client';

import {useState} from 'react';
import {LogOut, UserRound} from 'lucide-react';
import {useAccount} from './account-provider';
import {accountInitials, planLabel} from '../lib/account';

export function AccountAvatar() {
  const {user, loading} = useAccount();
  return <a className="account-avatar" href={user ? '/cuenta' : '/login'} aria-label={user ? `Mi cuenta: ${user.username}` : 'Iniciar sesión'}>
    {loading ? <span aria-label="Cargando cuenta">…</span> : user ? accountInitials(user.username) : <UserRound size={17}/>}
  </a>;
}

export function SidebarAccount() {
  const {user, loading, error, reload, logout} = useAccount();
  const [busy, setBusy] = useState(false), [logoutError, setLogoutError] = useState('');
  async function signOut() {
    setBusy(true); setLogoutError('');
    try {await logout();} catch (error) {setLogoutError(error instanceof Error ? error.message : 'No se pudo cerrar la sesión.');}
    finally {setBusy(false);}
  }
  return <div className="sidebar-account" aria-label="Tu cuenta">
    {loading ? <div className="account-guest" role="status"><span className="account-avatar"><UserRound size={17}/></span><span className="account-info"><strong>Cargando cuenta…</strong></span></div>
      : error ? <><div className="account-info"><small role="status">{error}</small></div><div className="account-actions"><button onClick={() => void reload()}>Reintentar</button></div><span className="account-compact-label"><AccountAvatar/></span></>
      : user ? <div className="account-user"><a className="account-trigger" href="/cuenta" aria-label={`Mi cuenta: ${user.username}, ${planLabel(user.plan)}`}><span className="account-avatar">{accountInitials(user.username)}</span><span className="account-info"><strong>{user.username}</strong><small>{planLabel(user.plan)}</small></span></a><button className="account-logout" aria-label="Cerrar sesión" title="Cerrar sesión" disabled={busy} onClick={() => void signOut()}><LogOut size={16}/></button></div>
      : <><div className="account-guest"><span className="account-avatar"><UserRound size={17}/></span><span className="account-info"><strong>Tu cuenta</strong><small>Accede a Clearance Radar</small></span><span className="account-compact-label"><AccountAvatar/></span></div><div className="account-actions"><a className="account-signin" href="/login">Iniciar sesión</a><a href="/registro">Registrarse</a></div></>}
    {logoutError && <p className="account-inline-error" role="alert">{logoutError}</p>}
  </div>;
}
