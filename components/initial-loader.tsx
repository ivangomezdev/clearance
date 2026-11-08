export function InitialLoader() {
  return <div className="initial-loader" role="status" aria-live="polite" aria-label="Cargando las mejores ofertas" aria-busy="true">
    <div className="loader-content">
      <div className="loader-orbit" aria-hidden="true"><span className="loader-ring"/><img src="/favicon.svg" alt="" width="92" height="92"/></div>
      <div className="loader-brand">clearance <span>radar.</span></div>
      <h1>Cargando las mejores ofertas</h1>
      <div className="loader-dots" aria-hidden="true"><span/><span/><span/></div>
    </div>
  </div>;
}
