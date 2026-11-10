import {priceSummary, type OfferPrice} from '../lib/offer-price';

const money = (n: number) => new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(n);

export function OfferPriceDisplay({value, detail = false}: {value: OfferPrice; detail?: boolean}) {
  const notes = priceSummary(value);
  return <div className={value.review ? 'offer-pricing price-review' : 'offer-pricing'}>
    {!value.review && value.scope !== 'store' && <p className="published-price-label">Precio publicado · sin verificar en el comercio</p>}
    <div className={detail ? 'detail-price' : 'prices'}>
      <strong>{value.scope === 'store' ? 'Precio por tienda' : value.amount === null ? 'Consultar precio' : value.amount === 0 ? 'Ver condiciones' : money(value.amount)}</strong>
      {value.original !== null && <del>{money(value.original)}</del>}
      {value.amount !== null && <span>USD</span>}
    </div>
    {value.scope === 'store' && value.publishedAmount != null && <p className="published-price">Publicado: {money(value.publishedAmount)} · sin confirmar en tu zona</p>}
    {notes.length > 0 && <ul className="price-notes" aria-label="Condiciones del precio">{notes.map(note => <li key={note}>{note}</li>)}</ul>}
  </div>;
}
