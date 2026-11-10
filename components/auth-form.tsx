'use client';

import {useEffect, useState} from 'react';
import {ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff} from 'lucide-react';
import {RadarLogo} from './radar-logo';
import {useAccount} from './account-provider';
import {planLabel} from '../lib/account';

export function AuthForm({mode}: {mode: 'login' | 'register' | 'account'}) {
  const {user, loading, configured, error: accountError, reload, logout} = useAccount();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmation, setConfirmation] = useState(false), [showPassword, setShowPassword] = useState(false);
  const register = mode === 'register', account = mode === 'account';
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('confirmation') === 'failed') setError('No se pudo confirmar el email. Abre el enlace en el navegador donde te registraste o inicia sesión si ya lo confirmaste.');
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    const payload = {email: form.get('email'), password: form.get('password'), ...(register ? {username: form.get('username'), dateOfBirth: form.get('dateOfBirth')} : {})};
    try {
      const response = await fetch(`/api/auth/${register ? 'register' : 'login'}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
      const data = await response.json() as {error?: string; confirmationRequired?: boolean};
      if (!response.ok) throw Error(data.error || 'No se pudo completar la solicitud.');
      if (data.confirmationRequired) {setConfirmation(true); return;}
      await reload(); window.location.assign('/');
    } catch (error) {setError(error instanceof Error ? error.message : 'No se pudo conectar. Inténtalo de nuevo.');}
    finally {setBusy(false);}
  }
  async function signOut() {
    setBusy(true); setError('');
    try {await logout(); window.location.assign('/');} catch (error) {setError(error instanceof Error ? error.message : 'No se pudo cerrar la sesión.');}
    finally {setBusy(false);}
  }
  return <main className="auth-page">
    <a className="auth-back" href="/"><ArrowLeft size={16}/> Volver a las ofertas</a>
    <div className="auth-layout"><section className="auth-intro" aria-label="Clearance Radar"><a className="auth-brand" href="/" aria-label="Clearance Radar · Inicio"><RadarLogo size={54}/><span>clearance <strong>radar.</strong></span></a><span className="auth-eyebrow">ENCUENTRA MÁS. PAGA MENOS.</span><h1>Tu radar.<br/>{' '}Tu próximo<br/>{' '}<span>gran hallazgo.</span></h1><p>Un solo lugar para explorar ofertas y encontrar lo que vale la pena.</p><div className="auth-art" aria-hidden="true"><RadarLogo size={190}/></div></section>
    <section className="auth-card" aria-label={account ? 'Mi cuenta' : register ? 'Registro' : 'Inicio de sesión'}>
      {loading ? <p role="status">Cargando tu cuenta…</p> : user ? <><span className="auth-eyebrow">MI CUENTA</span><h2>Hola, {user.username}.</h2><p>Este es tu espacio en Clearance Radar.</p><dl className="account-details"><div><dt>Usuario</dt><dd>{user.username}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Tu plan</dt><dd>{planLabel(user.plan)}</dd></div></dl><a className="primary" href="/">Explorar ofertas <ArrowRight size={16}/></a><button className="auth-switch" disabled={busy} onClick={() => void signOut()}>{busy ? 'Cerrando sesión…' : 'Cerrar sesión'}</button></>
        : confirmation ? <div className="auth-confirmation" role="status"><CheckCircle2 size={38}/><h2>Revisa tu correo.</h2><p>Si el email puede registrarse, recibirás un enlace para confirmar tu cuenta. Ábrelo en este mismo navegador y después podrás entrar.</p><a className="primary" href="/login">Ir a iniciar sesión <ArrowRight size={16}/></a></div>
          : <><span className="auth-eyebrow">{register ? 'EMPIEZA AQUÍ' : 'BIENVENIDO A TU RADAR'}</span><h2>{register ? 'Crea tu cuenta.' : 'Qué bueno verte.'}</h2><p>{register ? 'Regístrate para tener tu propio espacio en Clearance Radar.' : 'Inicia sesión para entrar a tu cuenta.'}</p>
            {!configured && !accountError && <p className="auth-notice" role="status">El acceso a cuentas estará disponible pronto.</p>}
            {accountError && <p className="auth-error" role="alert">{accountError} <button onClick={() => void reload()}>Reintentar</button></p>}
            <form onSubmit={submit}>
              {register && <label>Usuario<input name="username" autoComplete="username" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" placeholder="Tu nombre de usuario" required/><small>De 3 a 24 letras, números o guiones bajos.</small></label>}
              <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} placeholder="tu@email.com" required/></label>
              <label>Contraseña<span className="auth-password"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 8 : 1} maxLength={128} placeholder={register ? 'Al menos 8 caracteres' : 'Tu contraseña'} required/><button type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>
              {register && <label>Fecha de nacimiento<input name="dateOfBirth" type="date" autoComplete="bday" max={new Date().toISOString().slice(0, 10)} required/></label>}
              <button className="primary" disabled={busy || !configured || !!accountError}>{busy ? register ? 'Creando cuenta…' : 'Entrando…' : register ? 'Crear cuenta' : 'Iniciar sesión'}<ArrowRight size={16}/></button>
            </form><p className="auth-switch">{register ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'} <a href={register ? '/login' : '/registro'}>{register ? 'Inicia sesión' : 'Regístrate'}</a></p></>}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </section></div>
  </main>;
}
