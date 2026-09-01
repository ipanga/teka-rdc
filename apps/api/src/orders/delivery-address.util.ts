/**
 * Delivery-address resolution for order reads.
 *
 * An order carries BOTH a `deliveryAddressId` FK and a snapshot of the address
 * as it was when the order was placed. The snapshot is authoritative: buyers
 * have a single editable address, so reading through the relation would mean
 * every edit retroactively rewrote the delivery address of every past order
 * pointing at that row.
 *
 * The relation is still the fallback, for orders that predate the snapshot
 * backfill and for any created during a deploy window while the previous
 * container was still serving.
 *
 * The response shape is unchanged: callers keep reading `order.deliveryAddress`
 * with the same keys. The flat `delivery*` scalars are stripped so the snapshot
 * stays an implementation detail rather than a second, competing contract.
 */

export interface DeliveryAddressShape {
  id: string;
  label: string | null;
  province: string | null;
  town: string | null;
  neighborhood: string | null;
  avenue: string | null;
  reference: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
}

interface OrderWithSnapshot {
  deliveryAddressId: string;
  deliveryLabel?: string | null;
  deliveryProvince?: string | null;
  deliveryTown?: string | null;
  deliveryNeighborhood?: string | null;
  deliveryAvenue?: string | null;
  deliveryReference?: string | null;
  deliveryRecipientName?: string | null;
  deliveryRecipientPhone?: string | null;
  deliveryAddress?: Partial<DeliveryAddressShape> | null;
}

/**
 * Replaces `deliveryAddress` with the snapshot when the order has one, and
 * removes the flat snapshot columns from the payload.
 *
 * `deliveryTown` is the presence marker: it is non-null for every snapshotted
 * order because `town` is required on Address, so it cannot be a false negative
 * the way an optional field like `avenue` could.
 */
export function resolveDeliveryAddress<T extends OrderWithSnapshot>(
  order: T,
): Omit<
  T,
  | 'deliveryLabel'
  | 'deliveryProvince'
  | 'deliveryTown'
  | 'deliveryNeighborhood'
  | 'deliveryAvenue'
  | 'deliveryReference'
  | 'deliveryRecipientName'
  | 'deliveryRecipientPhone'
> & { deliveryAddress: DeliveryAddressShape | null } {
  const {
    deliveryLabel,
    deliveryProvince,
    deliveryTown,
    deliveryNeighborhood,
    deliveryAvenue,
    deliveryReference,
    deliveryRecipientName,
    deliveryRecipientPhone,
    ...rest
  } = order;

  const relation = order.deliveryAddress ?? null;

  const deliveryAddress: DeliveryAddressShape | null =
    deliveryTown != null
      ? {
          id: order.deliveryAddressId,
          label: deliveryLabel ?? null,
          province: deliveryProvince ?? null,
          town: deliveryTown,
          neighborhood: deliveryNeighborhood ?? null,
          avenue: deliveryAvenue ?? null,
          reference: deliveryReference ?? null,
          recipientName: deliveryRecipientName ?? null,
          recipientPhone: deliveryRecipientPhone ?? null,
        }
      : relation
        ? {
            id: relation.id ?? order.deliveryAddressId,
            label: relation.label ?? null,
            province: relation.province ?? null,
            town: relation.town ?? null,
            neighborhood: relation.neighborhood ?? null,
            avenue: relation.avenue ?? null,
            reference: relation.reference ?? null,
            recipientName: relation.recipientName ?? null,
            recipientPhone: relation.recipientPhone ?? null,
          }
        : null;

  return { ...rest, deliveryAddress } as Omit<
    T,
    | 'deliveryLabel'
    | 'deliveryProvince'
    | 'deliveryTown'
    | 'deliveryNeighborhood'
    | 'deliveryAvenue'
    | 'deliveryReference'
    | 'deliveryRecipientName'
    | 'deliveryRecipientPhone'
  > & { deliveryAddress: DeliveryAddressShape | null };
}

/**
 * The snapshot written at checkout time. Kept next to the resolver so the write
 * and read sides cannot drift apart.
 */
export function deliveryAddressSnapshot(address: {
  label?: string | null;
  province?: string | null;
  town: string;
  neighborhood: string;
  avenue?: string | null;
  reference?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
}) {
  return {
    deliveryLabel: address.label ?? null,
    deliveryProvince: address.province ?? null,
    deliveryTown: address.town,
    deliveryNeighborhood: address.neighborhood,
    deliveryAvenue: address.avenue ?? null,
    deliveryReference: address.reference ?? null,
    deliveryRecipientName: address.recipientName ?? null,
    deliveryRecipientPhone: address.recipientPhone ?? null,
  };
}
