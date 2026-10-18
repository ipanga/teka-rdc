import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildDeliveryDocument, type DocumentOrder } from '@/lib/delivery-document';
import { DeliveryDocumentView } from './delivery-document';

const NOW = new Date('2026-10-17T12:30:00Z');

const base: DocumentOrder = {
  id: 'o1',
  orderNumber: 'TK-20261017-7Q4P',
  status: 'OUT_FOR_DELIVERY',
  paymentMethod: 'COD',
  paymentStatus: 'PENDING',
  subtotalCDF: '6750000',
  deliveryFeeCDF: '0',
  totalCDF: '6750000',
  buyerNote: '<script>alert(1)</script> & sonner 2×',
  createdAt: '2026-10-16T08:05:00Z',
  items: [
    { id: 'i1', productTitle: 'Pagne <b>wax</b> "Super"', quantity: 3, unitPriceCDF: '2250000', listUnitPriceCDF: '2500000', totalCDF: '6750000' },
  ],
  deliveryAddress: {
    town: 'Lubumbashi',
    neighborhood: 'Kampemba',
    avenue: 'Avenue <img src=x onerror=alert(1)>',
    recipientName: 'Ilunga Mwamba',
    recipientPhone: '+243999000131',
  },
  buyer: { firstName: 'Ilunga', lastName: 'Mwamba', phone: '+243999000131' },
  seller: { sellerProfile: { businessName: 'Boutique Kabila' } },
};

const render = (o: DocumentOrder) =>
  renderToStaticMarkup(
    createElement(DeliveryDocumentView, { result: buildDeliveryDocument(o, NOW), logoSrc: '/admin/logo.svg' }),
  );

describe('DeliveryDocumentView (server-rendered markup)', () => {
  it('escapes every user-entered text — no injected markup reaches the page', () => {
    const html = render(base);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>wax</b>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; sonner 2×');
    expect(html).toContain('Pagne &lt;b&gt;wax&lt;/b&gt; &quot;Super&quot;');
  });

  it('is a labelled document with a captioned table whose header can repeat on every page', () => {
    const html = render(base);
    expect(html).toContain('<h1 id="bdl-title" class="bdl-title">Bon de livraison</h1>');
    expect(html).toContain('ne constitue pas une facture');
    expect(html).toMatch(/<table class="bdl-table"><caption[^>]*>Articles de la commande TK-20261017-7Q4P<\/caption><thead>/);
    expect(html).toContain('scope="col"');
    expect(html).toContain('src="/admin/logo.svg"');
    expect(html).toContain('alt="Teka RDC"');
  });

  it('shows the snapshot prices, the amount to collect and the signature block', () => {
    const html = render(base);
    expect(html).toContain('22.500 FC');
    expect(html).toContain('au lieu de 25.000 FC');
    expect(html).toContain('Montant à encaisser à la livraison');
    expect(html).toContain('<p class="bdl-pay-amount">67.500 FC</p>');
    expect(html).toContain('Frais de livraison</dt><dd>0 FC');
    expect(html).toContain('Reçu par (client)');
  });

  it('invents no fiscal data: no tax line, no invoice number, no registration ids', () => {
    const html = render(base).toLowerCase();
    for (const word of ['tva', 'taxe', 'facture n', 'rccm', 'id nat', 'nif', 'numéro de facture']) {
      expect(html).not.toContain(word);
    }
  });

  it('a cancelled order renders only the ineligibility notice — no table, no amount', () => {
    const html = render({ ...base, status: 'CANCELLED', paymentStatus: 'FAILED' });
    expect(html).toContain('Bon de livraison non disponible');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('<table');
    expect(html).not.toMatch(/\d FC/);
  });

  it('a historical non-COD order shows no cash-to-collect amount block', () => {
    const html = render({ ...base, paymentMethod: 'MOBILE_MONEY', paymentStatus: 'COMPLETED' });
    expect(html).not.toContain('bdl-pay-amount');
    expect(html).toContain('Mobile Money (ancien mode de paiement)');
  });
});
