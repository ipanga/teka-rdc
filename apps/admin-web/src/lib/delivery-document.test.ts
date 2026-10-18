import { formatFC } from '@teka/shared';
import { assetPath } from './asset-path';
import { buildDeliveryDocument, formatDocumentDate, type DocumentOrder } from './delivery-document';

const NOW = new Date('2026-10-17T12:30:00Z');

function order(over: Partial<DocumentOrder> = {}): DocumentOrder {
  return {
    id: '70000000-0000-4000-8000-000000000042',
    orderNumber: 'TK-20261017-7Q4P',
    status: 'OUT_FOR_DELIVERY',
    paymentMethod: 'COD',
    paymentStatus: 'PENDING',
    subtotalCDF: '9250000',
    deliveryFeeCDF: '300000',
    totalCDF: '9550000',
    buyerNote: 'Appeler avant 17h',
    createdAt: '2026-10-16T08:05:00Z',
    items: [
      { id: 'i1', productTitle: 'Pagne wax 6 yards', quantity: 3, unitPriceCDF: '2250000', listUnitPriceCDF: '2500000', totalCDF: '6750000' },
      { id: 'i2', productTitle: 'Savon de Marseille', quantity: 1, unitPriceCDF: '2500000', listUnitPriceCDF: null, totalCDF: '2500000' },
    ],
    deliveryAddress: {
      label: 'Maison',
      province: 'Haut-Katanga',
      town: 'Lubumbashi',
      neighborhood: 'Kampemba',
      avenue: 'Avenue Kasavubu 12',
      reference: 'Derrière la paroisse',
      recipientName: 'Ilunga Mwamba',
      recipientPhone: '+243999000131',
    },
    buyer: { firstName: 'Ilunga', lastName: 'Mwamba', phone: '+243999000131' },
    seller: { firstName: 'Marie', lastName: 'Kabila', sellerProfile: { businessName: 'Boutique Kabila' } },
    ...over,
  };
}

const doc = (o: DocumentOrder) => {
  const r = buildDeliveryDocument(o, NOW);
  if (!r.printable) throw new Error(`not printable: ${r.reason}`);
  return r.document;
};

describe('formatFC — exact for BigInt-sized centimes', () => {
  it('keeps every digit beyond 2^53 (string and bigint input)', () => {
    expect(formatFC('987654321098765432100')).toBe('9.876.543.210.987.654.321 FC');
    expect(formatFC(BigInt('987654321098765432100'))).toBe('9.876.543.210.987.654.321 FC');
  });

  it('rounds exactly like before (Math.round of centimes / 100)', () => {
    for (const c of [0, 49, 50, 149, 150, 151, -49, -50, -51, -150, -151, 5295700, 12500000]) {
      const legacy = Math.round(c / 100);
      const expected = `${legacy < 0 ? '-' : ''}${Math.abs(legacy).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} FC`;
      expect(formatFC(String(c))).toBe(expected);
    }
    expect(formatFC('12500000')).toBe('125.000 FC');
    expect(formatFC(null)).toBe('—');
  });
});

describe('buildDeliveryDocument — snapshot data only', () => {
  it('prints charged prices, the list-price snapshot only when higher, line totals and totals', () => {
    const d = doc(order());
    expect(d.lines).toEqual([
      { id: 'i1', title: 'Pagne wax 6 yards', quantity: 3, unitPrice: '22.500 FC', listUnitPrice: '25.000 FC', lineTotal: '67.500 FC' },
      { id: 'i2', title: 'Savon de Marseille', quantity: 1, unitPrice: '25.000 FC', listUnitPrice: null, lineTotal: '25.000 FC' },
    ]);
    expect([d.subtotal, d.deliveryFee, d.total]).toEqual(['92.500 FC', '3.000 FC', '95.500 FC']);
  });

  it('uses the delivery-address SNAPSHOT (deliveryAddress), most specific first', () => {
    const d = doc(order());
    expect(d.recipient).toEqual({ name: 'Ilunga Mwamba', phone: '+243999000131' });
    expect(d.addressLines).toEqual([
      'Avenue Kasavubu 12',
      'Kampemba, Lubumbashi',
      'Haut-Katanga',
      'Repère : Derrière la paroisse',
    ]);
    expect(d.seller).toBe('Boutique Kabila');
    expect(d.instructions).toBe('Appeler avant 17h');
  });

  it('degrades without inventing: missing pieces are omitted, names fall back to the buyer', () => {
    const d = doc(order({
      deliveryAddress: { town: 'Kolwezi', neighborhood: '  ', recipientName: null, recipientPhone: null },
      buyerNote: '   ',
      seller: { firstName: 'Jean', lastName: 'K', sellerProfile: null },
    }));
    expect(d.addressLines).toEqual(['Kolwezi']);
    expect(d.recipient).toEqual({ name: 'Ilunga Mwamba', phone: '+243999000131' });
    expect(d.instructions).toBeNull();
    expect(d.seller).toBe('Jean K');
  });

  it('zero delivery fee prints as « 0 FC », never hidden', () => {
    expect(doc(order({ deliveryFeeCDF: '0' })).deliveryFee).toBe('0 FC');
  });

  it('large orders: exact BigInt-sized amounts and every line kept', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      id: `i${i}`, productTitle: `Article ${i}`, quantity: 1, unitPriceCDF: '100', listUnitPriceCDF: null, totalCDF: '100',
    }));
    const d = doc(order({ items, subtotalCDF: '987654321098765432100', totalCDF: '987654321098765432100' }));
    expect(d.lines).toHaveLength(60);
    expect(d.total).toBe('9.876.543.210.987.654.321 FC');
    expect(d.payment.amount).toBe('9.876.543.210.987.654.321 FC');
  });

  it('dates read in Lubumbashi time; generation date is the given instant', () => {
    const d = doc(order());
    expect(d.orderedAt).toBe(formatDocumentDate('2026-10-16T08:05:00Z'));
    expect(d.orderedAt).toContain('10:05'); // UTC+2
    expect(d.generatedAt).toBe(formatDocumentDate(NOW));
    expect(d.deliveredAt).toBeNull();
  });
});

describe('buildDeliveryDocument — payment and eligibility', () => {
  it('COD unpaid: the amount to collect is the order total', () => {
    const p = doc(order()).payment;
    expect(p).toMatchObject({ kind: 'cod_to_collect', headline: 'Montant à encaisser à la livraison', amount: '95.500 FC' });
    expect(p.statusLabel).toBe('En attente d’encaissement');
  });

  it('COD collected (delivered): says nothing is left to collect, shows the delivery date', () => {
    const d = doc(order({ status: 'DELIVERED', paymentStatus: 'COMPLETED', deliveredAt: '2026-10-17T09:00:00Z' }));
    expect(d.payment).toMatchObject({ kind: 'cod_collected', headline: 'Montant déjà encaissé — rien à encaisser', statusLabel: 'Encaissé' });
    expect(d.deliveredAt).toBe(formatDocumentDate('2026-10-17T09:00:00Z'));
  });

  it.each(['FAILED', 'REFUNDED'])('COD payment %s on a live order: no document, no amount', (paymentStatus) => {
    const r = buildDeliveryDocument(order({ paymentStatus }), NOW);
    expect(r.printable).toBe(false);
    expect(JSON.stringify(r)).not.toContain('FC');
  });

  it.each(['CANCELLED', 'RETURNED'])('%s: visibly ineligible, and no amount anywhere', (status) => {
    const r = buildDeliveryDocument(order({ status, paymentStatus: status === 'CANCELLED' ? 'FAILED' : 'COMPLETED' }), NOW);
    expect(r.printable).toBe(false);
    if (r.printable) return;
    expect(r.reason).toContain('aucun bon de livraison ne peut être émis');
    expect(r.orderNumber).toBe('TK-20261017-7Q4P');
    expect(JSON.stringify(r)).not.toMatch(/\d FC/);
  });

  it('historical non-COD order: labelled with its own method/status, never as cash to collect', () => {
    const p = doc(order({ paymentMethod: 'MOBILE_MONEY', paymentStatus: 'COMPLETED' })).payment;
    expect(p.kind).toBe('non_cod');
    expect(p.methodLabel).toBe('Mobile Money (ancien mode de paiement)');
    expect(p.statusLabel).toBe('Encaissé');
    expect(p.headline).toContain('n’encaissez rien');
  });

  it('building is pure: the input order is not modified', () => {
    const o = order();
    const before = JSON.stringify(o);
    buildDeliveryDocument(o, NOW);
    expect(JSON.stringify(o)).toBe(before);
  });
});

describe('assetPath (logo under the basePath)', () => {
  it('prefixes the local /admin basePath and the root in production', () => {
    expect(assetPath('/logo.svg', '/admin')).toBe('/admin/logo.svg');
    expect(assetPath('/logo.svg', '')).toBe('/logo.svg');
    expect(assetPath('logo.svg', '/admin/')).toBe('/admin/logo.svg');
    expect(assetPath('/logo.svg', undefined)).toBe('/admin/logo.svg'); // next.config default
  });
});
