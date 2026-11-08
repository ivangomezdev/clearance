import {priceSummary, type OfferPrice} from '../lib/offer-price';

const money = (n: number) => new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'}).format(n);

export function OfferPriceDisplay({value, detail = false}: {value: OfferPrice; detail?: boolean}) {
  const notes = priceSummary(value);
  return <div className={value.review ? 'offer-pricing price-review' : 'offer-pricing'}>
    <div className={detail ? 'detail-price' : 'prices'}>
      <strong>{value.amount === null ? 'Consultar precio' : value.amount === 0 ? 'Ver condiciones' : money(value.amount)}</strong>
      {value.original !== null && <del>{money(value.original)}</del>}
      {value.amount !== null && <span>USD</span>}
    </div>
    {notes.length > 0 && <ul className="price-notes" aria-label="Condiciones del precio">{notes.map(note => <li key={note}>{note}</li>)}</ul>}
  </div>;
}
