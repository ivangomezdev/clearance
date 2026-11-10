import {RadarLogo} from './radar-logo';

export function InitialLoader() {
  return <div className="initial-loader" role="status" aria-live="polite" aria-label="Cargando las mejores ofertas" aria-busy="true">
    <div className="loader-content">
      <div className="loader-orbit" aria-hidden="true"><RadarLogo size={118} animated/></div>
      <div className="loader-brand">clearance <span>radar.</span></div>
      <h1>Cargando las mejores ofertas</h1>
      <div className="loader-dots" aria-hidden="true"><span/><span/><span/></div>
    </div>
  </div>;
}
