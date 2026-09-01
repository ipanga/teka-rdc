import {
  deliveryAddressSnapshot,
  resolveDeliveryAddress,
} from './delivery-address.util';

/**
 * The point of the snapshot: a buyer has one editable address, so reading an
 * order's delivery address through the FK would mean every edit retroactively
 * rewrote the address on every past order. Production already has addresses
 * referenced by more than one order.
 */

const snapshot = {
  deliveryLabel: null,
  deliveryProvince: 'Haut-Katanga',
  deliveryTown: 'Lubumbashi',
  deliveryNeighborhood: 'Kampemba',
  deliveryAvenue: 'Av. Lumumba 24',
  deliveryReference: 'En face de la pharmacie',
  deliveryRecipientName: 'Jean Kabila',
  deliveryRecipientPhone: '+243990000001',
};

/** The buyer has since edited their address to a different town. */
const editedRelation = {
  id: 'addr-1',
  label: null,
  province: 'Lualaba',
  town: 'Kolwezi',
  neighborhood: 'Dilala',
  avenue: 'Av. Kasavubu 9',
  reference: null,
  recipientName: 'Jean Kabila',
  recipientPhone: '+243990000002',
};

describe('resolveDeliveryAddress', () => {
  it('returns the snapshot, not the edited address, once one exists', () => {
    const result = resolveDeliveryAddress({
      id: 'o1',
      deliveryAddressId: 'addr-1',
      ...snapshot,
      deliveryAddress: editedRelation,
    });

    expect(result.deliveryAddress).toEqual({
      id: 'addr-1',
      label: null,
      province: 'Haut-Katanga',
      town: 'Lubumbashi',
      neighborhood: 'Kampemba',
      avenue: 'Av. Lumumba 24',
      reference: 'En face de la pharmacie',
      recipientName: 'Jean Kabila',
      recipientPhone: '+243990000001',
    });
  });

  it('falls back to the relation for orders placed before the backfill', () => {
    const result = resolveDeliveryAddress({
      id: 'o1',
      deliveryAddressId: 'addr-1',
      deliveryTown: null,
      deliveryAddress: editedRelation,
    });

    expect(result.deliveryAddress).toMatchObject({ town: 'Kolwezi' });
  });

  it('strips the flat snapshot columns from the payload', () => {
    const result = resolveDeliveryAddress({
      id: 'o1',
      deliveryAddressId: 'addr-1',
      ...snapshot,
      deliveryAddress: editedRelation,
    }) as Record<string, unknown>;

    for (const key of Object.keys(snapshot)) {
      expect(result).not.toHaveProperty(key);
    }
  });

  it('preserves every other order field', () => {
    const result = resolveDeliveryAddress({
      id: 'o1',
      orderNumber: 'TK-1',
      totalCDF: 152000n,
      deliveryAddressId: 'addr-1',
      ...snapshot,
      deliveryAddress: editedRelation,
    });

    expect(result).toMatchObject({
      id: 'o1',
      orderNumber: 'TK-1',
      totalCDF: 152000n,
    });
  });

  it('yields null when there is neither a snapshot nor a loaded relation', () => {
    const result = resolveDeliveryAddress({
      id: 'o1',
      deliveryAddressId: 'addr-1',
      deliveryTown: null,
      deliveryAddress: null,
    });

    expect(result.deliveryAddress).toBeNull();
  });
});

describe('deliveryAddressSnapshot', () => {
  it('maps an address onto the order snapshot columns', () => {
    expect(
      deliveryAddressSnapshot({
        label: 'Maison',
        province: 'Haut-Katanga',
        town: 'Lubumbashi',
        neighborhood: 'Kampemba',
        avenue: 'Av. Lumumba 24',
        reference: 'En face de la pharmacie',
        recipientName: 'Jean Kabila',
        recipientPhone: '+243990000001',
      }),
    ).toEqual({ ...snapshot, deliveryLabel: 'Maison' });
  });

  it('normalises missing optionals to null rather than undefined', () => {
    const result = deliveryAddressSnapshot({
      town: 'Likasi',
      neighborhood: 'Kikula',
    });

    expect(result.deliveryTown).toBe('Likasi');
    expect(result.deliveryAvenue).toBeNull();
    expect(result.deliveryRecipientPhone).toBeNull();
  });

  it('round-trips through the resolver unchanged', () => {
    const written = deliveryAddressSnapshot({
      town: 'Likasi',
      neighborhood: 'Kikula',
      recipientName: 'Awa',
    });

    const { deliveryAddress } = resolveDeliveryAddress({
      deliveryAddressId: 'addr-9',
      ...written,
      deliveryAddress: editedRelation,
    });

    expect(deliveryAddress).toMatchObject({
      town: 'Likasi',
      neighborhood: 'Kikula',
      recipientName: 'Awa',
    });
  });
});
