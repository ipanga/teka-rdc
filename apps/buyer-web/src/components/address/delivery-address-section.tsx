'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { AddressForm } from '@/components/address/address-form';
import type { Address } from '@/lib/types';

/**
 * "Adresse de livraison" on /profil.
 *
 * buyer-web previously had no address management outside checkout: the form was
 * inline on the checkout page, there was no address route, and no client had
 * ever called PATCH /v1/addresses/:id — so a buyer could add addresses forever
 * and never correct one.
 *
 * A buyer has exactly one address (enforced server-side by the upsert in
 * AddressesService.create), so this shows that address with « Modifier », or a
 * call to action when there is none. Legacy buyers may still have more than one
 * row until the archive migration runs; the API returns the default (else
 * newest) first, and that is the one shown and edited.
 */
export function DeliveryAddressSection() {
  const [address, setAddress] = useState<Address | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Address[]>('/v1/addresses')
      .then((res) => {
        if (cancelled) return;
        setAddress(res.data.length > 0 ? res.data[0] : null);
      })
      .catch(() => {
        if (!cancelled) setError('Impossible de charger votre adresse.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mb-6 bg-white rounded-xl border border-border p-6">
      <h2 className="text-base font-semibold text-foreground mb-2">
        {'Adresse de livraison'}
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        {'Cette adresse est utilisée pour toutes vos commandes.'}
      </p>

      {loading ? (
        <div className="animate-pulse h-20 bg-muted rounded-lg" />
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : showForm ? (
        <AddressForm
          initial={address}
          onSaved={(saved) => {
            setAddress(saved);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : address ? (
        <div className="space-y-3">
          <div className="p-4 rounded-lg border border-border bg-surface">
            {address.recipientName && (
              <p className="text-sm font-semibold text-foreground">
                {address.recipientName}
              </p>
            )}
            {address.recipientPhone && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {address.recipientPhone}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {address.neighborhood}, {address.town}
              {address.avenue ? `, ${address.avenue}` : ''}
            </p>
            {address.reference && (
              <p className="text-xs text-muted-foreground mt-1">
                {address.reference}
              </p>
            )}
          </div>
          <Button variant="outline" size="md" onClick={() => setShowForm(true)}>
            {'Modifier'}
          </Button>
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-muted-foreground mb-3">
            {'Aucune adresse enregistrée'}
          </p>
          <Button variant="default" size="md" onClick={() => setShowForm(true)}>
            {'Ajouter mon adresse'}
          </Button>
        </div>
      )}
    </section>
  );
}
