const artwork = '/favicon.svg?v=radar-eye-1';

export function RadarLogo({size = 24, animated = false, className = ''}: {size?: number; animated?: boolean; className?: string}) {
  return <svg className={`radar-logo${animated ? ' radar-logo-animated' : ''} ${className}`} width={size} height={size} viewBox="0 0 280 280" aria-hidden="true" focusable="false">
    <use href={`${artwork}#radar-base`}/>
    <use href={`${artwork}#radar-sweep`} className="radar-logo-sweep"/>
    <use href={`${artwork}#radar-dot`}/>
  </svg>;
}
