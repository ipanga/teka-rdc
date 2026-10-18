import type { DocumentResult } from '@/lib/delivery-document';

/**
 * Presentational « Bon de livraison » (A4). Pure: renders a prepared
 * DocumentResult (lib/delivery-document.ts) and nothing else — no fetching,
 * no state — so it is server-renderable in tests. React escapes every text
 * value (titles, notes, addresses are user-entered). Print rules live in
 * globals.css under `.bdl-*`.
 */
export function DeliveryDocumentView({
  result,
  logoSrc,
}: {
  result: DocumentResult;
  logoSrc: string;
}) {
  if (!result.printable) {
    return (
      <article className="bdl-sheet bdl-ineligible" aria-labelledby="bdl-title">
        <header className="bdl-head">
          <img src={logoSrc} alt="Teka RDC" className="bdl-logo" width={150} height={30} />
          <div>
            <h1 id="bdl-title" className="bdl-title">Bon de livraison non disponible</h1>
            <p className="bdl-ref">Commande {result.orderNumber} · {result.statusLabel}</p>
          </div>
        </header>
        <p className="bdl-alert" role="alert">{result.reason}</p>
      </article>
    );
  }

  const d = result.document;
  const p = d.payment;
  return (
    <article className="bdl-sheet" aria-labelledby="bdl-title">
      <header className="bdl-head">
        <img src={logoSrc} alt="Teka RDC" className="bdl-logo" width={150} height={30} />
        <div className="bdl-head-text">
          <h1 id="bdl-title" className="bdl-title">Bon de livraison</h1>
          <p className="bdl-ref">
            Commande <strong>{d.orderNumber}</strong>
          </p>
          <p className="bdl-muted">
            Document opérationnel de livraison — ne constitue pas une facture.
          </p>
        </div>
      </header>

      <dl className="bdl-meta">
        <div><dt>Commandée le</dt><dd>{d.orderedAt}</dd></div>
        <div><dt>Statut</dt><dd>{d.statusLabel}</dd></div>
        {d.deliveredAt && <div><dt>Livrée le</dt><dd>{d.deliveredAt}</dd></div>}
        <div><dt>Document généré le</dt><dd>{d.generatedAt}</dd></div>
      </dl>

      <section className="bdl-parties" aria-label="Parties">
        <div className="bdl-box">
          <h2 className="bdl-h2">Livrer à</h2>
          <p className="bdl-strong">{d.recipient.name}</p>
          {d.recipient.phone && <p>Tél. : {d.recipient.phone}</p>}
          {d.addressLines.map((line) => (
            <p key={line} className="bdl-wrap">{line}</p>
          ))}
          {d.buyer.name !== d.recipient.name && (
            <p className="bdl-muted">
              Client : {d.buyer.name}
              {d.buyer.phone && d.buyer.phone !== d.recipient.phone ? ` · ${d.buyer.phone}` : ''}
            </p>
          )}
        </div>
        <div className="bdl-box">
          <h2 className="bdl-h2">Vendu par</h2>
          <p className="bdl-strong bdl-wrap">{d.seller}</p>
          <p className="bdl-muted">Livraison assurée par Teka RDC — teka.cd/contact</p>
        </div>
      </section>

      {d.instructions && (
        <section className="bdl-box bdl-avoid" aria-label="Instructions du client">
          <h2 className="bdl-h2">Instructions du client</h2>
          <p className="bdl-wrap bdl-pre">{d.instructions}</p>
        </section>
      )}

      <div className="bdl-table-wrap">
      <table className="bdl-table">
        <caption className="bdl-sr">Articles de la commande {d.orderNumber}</caption>
        <thead>
          <tr>
            <th scope="col" className="bdl-col-title">Article</th>
            <th scope="col" className="bdl-num">Qté</th>
            <th scope="col" className="bdl-num">Prix unitaire</th>
            <th scope="col" className="bdl-num">Total</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l) => (
            <tr key={l.id}>
              <td className="bdl-wrap">{l.title}</td>
              <td className="bdl-num">{l.quantity}</td>
              <td className="bdl-num">
                {l.unitPrice}
                {l.listUnitPrice && <span className="bdl-list">au lieu de {l.listUnitPrice}</span>}
              </td>
              <td className="bdl-num">{l.lineTotal}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <section className="bdl-bottom bdl-avoid">
        <dl className="bdl-totals" aria-label="Totaux">
          <div><dt>Sous-total articles</dt><dd>{d.subtotal}</dd></div>
          <div><dt>Frais de livraison</dt><dd>{d.deliveryFee}</dd></div>
          <div className="bdl-grand"><dt>Total de la commande</dt><dd>{d.total}</dd></div>
        </dl>

        <div className={`bdl-pay bdl-pay-${p.kind}`} aria-label="Paiement">
          <p className="bdl-muted">{p.methodLabel} · {p.statusLabel}</p>
          <p className="bdl-pay-headline">{p.headline}</p>
          {p.kind !== 'non_cod' && <p className="bdl-pay-amount">{p.amount}</p>}
        </div>

        <div className="bdl-sign">
          <div><p className="bdl-h2">Remis par (livreur Teka)</p><p className="bdl-line">Nom, signature</p></div>
          <div><p className="bdl-h2">Reçu par (client)</p><p className="bdl-line">Nom, signature, date</p></div>
        </div>
      </section>

      <footer className="bdl-foot bdl-muted">
        Teka RDC · teka.cd · Commande {d.orderNumber} · généré le {d.generatedAt}
      </footer>
    </article>
  );
}
