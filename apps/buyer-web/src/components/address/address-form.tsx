'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Address, Commune } from '@/lib/types';
import type { City } from '@/lib/city-store';

/**
 * The buyer's single delivery-address form, shared by checkout and /profil.
 *
 * Extracted from the checkout page, where it was inline and therefore
 * unavailable anywhere else — which is why buyer-web had no address management
 * at all outside checkout, and no way to edit an address.
 *
 * Field names are the API contract: `reference` and `recipientPhone`. The API
 * runs `forbidNonWhitelisted`, so `details`/`phone` are a 400, not an ignored
 * field.
 */

interface AddressFormProps {
  /** Existing address to edit. Omit to create. */
  initial?: Address | null;
  onSaved: (address: Address) => void;
  onCancel: () => void;
}

const selectClass =
  'w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function AddressForm({ initial, onSaved, onCancel }: AddressFormProps) {
  const isEditing = Boolean(initial);

  const [cities, setCities] = useState<City[]>([]);
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [isLoadingCities, setIsLoadingCities] = useState(true);
  const [isLoadingCommunes, setIsLoadingCommunes] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    cityId: initial?.cityId ?? '',
    communeId: initial?.communeId ?? '',
    province: initial?.province ?? '',
    town: initial?.town ?? '',
    neighborhood: initial?.neighborhood ?? '',
    avenue: initial?.avenue ?? '',
    reference: initial?.reference ?? '',
    recipientName: initial?.recipientName ?? '',
    recipientPhone: initial?.recipientPhone ?? '',
  });

  useEffect(() => {
    setIsLoadingCities(true);
    apiFetch<City[]>('/v1/cities')
      .then((res) => {
        setCities(res.data);
        // Older rows may predate cityId being captured — fall back to matching
        // the stored town name so editing still preselects correctly.
        if (initial && !initial.cityId && initial.town) {
          const match = res.data.find((c) => c.name === initial.town);
          if (match) {
            setForm((prev) => ({ ...prev, cityId: match.id }));
          }
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingCities(false));
    // Runs once; `initial` is the props snapshot the form was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!form.cityId) {
      setCommunes([]);
      return;
    }
    setIsLoadingCommunes(true);
    setCommunes([]);
    apiFetch<Commune[]>(`/v1/cities/${form.cityId}/communes`)
      .then((res) => {
        setCommunes(res.data);
        if (initial && !form.communeId && initial.neighborhood) {
          const match = res.data.find((c) => c.name === initial.neighborhood);
          if (match) {
            setForm((prev) => ({
              ...prev,
              communeId: match.id,
              neighborhood: match.name,
            }));
          }
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingCommunes(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.cityId]);

  function handleCityChange(cityId: string) {
    const city = cities.find((c) => c.id === cityId);
    setForm((prev) => ({
      ...prev,
      cityId,
      communeId: '',
      province: city?.province || '',
      town: city?.name || '',
      neighborhood: '',
    }));
  }

  function handleCommuneChange(communeId: string) {
    const commune = communes.find((c) => c.id === communeId);
    setForm((prev) => ({
      ...prev,
      communeId,
      neighborhood: commune?.name || '',
    }));
  }

  async function handleSave() {
    if (!form.cityId || !form.communeId) return;
    setIsSaving(true);
    setError(null);

    // On edit, a cleared field must be sent as null rather than omitted:
    // Prisma ignores `undefined`, so omitting would silently keep the old
    // value and clearing a landmark would appear to do nothing.
    const optional = (value: string) => {
      const v = value.trim();
      if (v) return v;
      return isEditing ? null : undefined;
    };

    const body = {
      province: form.province,
      town: form.town,
      neighborhood: form.neighborhood,
      cityId: form.cityId,
      communeId: form.communeId,
      avenue: optional(form.avenue),
      reference: optional(form.reference),
      recipientName: optional(form.recipientName),
      recipientPhone: optional(form.recipientPhone),
    };

    try {
      const res = await apiFetch<Address>(
        isEditing ? `/v1/addresses/${initial!.id}` : '/v1/addresses',
        { method: isEditing ? 'PATCH' : 'POST', body: JSON.stringify(body) },
      );
      onSaved(res.data);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de l'enregistrement",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground tracking-tight">
        {isEditing ? 'Modifier mon adresse' : 'Mon adresse'}
      </h3>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div>
        <Label htmlFor="addr-city">
          {'Ville'} <span className="text-destructive">*</span>
        </Label>
        {isLoadingCities ? (
          <p className="text-sm text-muted-foreground py-2">
            {'Chargement des villes...'}
          </p>
        ) : (
          <select
            id="addr-city"
            value={form.cityId}
            onChange={(e) => handleCityChange(e.target.value)}
            className={selectClass}
          >
            <option value="">{'Sélectionnez une ville'}</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name} ({city.province})
              </option>
            ))}
          </select>
        )}
      </div>

      {form.cityId && (
        <div>
          <Label htmlFor="addr-commune">
            {'Commune'} <span className="text-destructive">*</span>
          </Label>
          {isLoadingCommunes ? (
            <p className="text-sm text-muted-foreground py-2">
              {'Chargement des communes...'}
            </p>
          ) : (
            <select
              id="addr-commune"
              value={form.communeId}
              onChange={(e) => handleCommuneChange(e.target.value)}
              className={selectClass}
            >
              <option value="">{'Sélectionnez une commune'}</option>
              {communes.map((commune) => (
                <option key={commune.id} value={commune.id}>
                  {commune.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div>
        <Label htmlFor="addr-avenue">{'Avenue / Rue'}</Label>
        <Input
          id="addr-avenue"
          value={form.avenue}
          onChange={(e) => setForm((p) => ({ ...p, avenue: e.target.value }))}
          placeholder={'Ex: Av. Lumumba n°24'}
        />
      </div>

      <div>
        <Label htmlFor="addr-reference">{'Point de repère'}</Label>
        <Input
          id="addr-reference"
          value={form.reference}
          onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))}
          placeholder={'Ex: En face de la pharmacie'}
        />
      </div>

      <div>
        <Label htmlFor="addr-recipient">{'Nom du destinataire'}</Label>
        <Input
          id="addr-recipient"
          value={form.recipientName}
          onChange={(e) =>
            setForm((p) => ({ ...p, recipientName: e.target.value }))
          }
          placeholder={'Nom complet'}
        />
      </div>

      <div>
        <Label htmlFor="addr-recipient-phone">
          {'Téléphone du destinataire'}
        </Label>
        <Input
          id="addr-recipient-phone"
          type="tel"
          value={form.recipientPhone}
          onChange={(e) =>
            setForm((p) => ({ ...p, recipientPhone: e.target.value }))
          }
          placeholder={'+243...'}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" size="md" className="flex-1" onClick={onCancel}>
          {'Annuler'}
        </Button>
        <Button
          variant="default"
          size="md"
          className="flex-1"
          onClick={handleSave}
          disabled={!form.cityId || !form.communeId || isSaving}
        >
          {isSaving ? 'Enregistrement...' : "Enregistrer l'adresse"}
        </Button>
      </div>
    </div>
  );
}
