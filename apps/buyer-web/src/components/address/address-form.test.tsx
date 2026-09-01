import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Guards the address payload buyer-web sends.
 *
 * It shipped posting `details`/`phone` while the API accepts
 * `reference`/`recipientPhone`. Under `forbidNonWhitelisted` those are a 400,
 * not an ignored field — so saving an address failed outright whenever the
 * buyer filled in the landmark or the recipient phone. The same mismatch made
 * the recipient phone render blank on every checkout address.
 */

// vi.mock factories are hoisted — shared mocks must live in vi.hoisted().
const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: mocks.apiFetch,
}));

import { AddressForm } from './address-form';

const CITIES = [
  { id: 'city-1', name: 'Lubumbashi', province: 'Haut-Katanga' },
  { id: 'city-2', name: 'Kolwezi', province: 'Lualaba' },
];
const COMMUNES = [
  { id: 'com-1', cityId: 'city-1', name: 'Kampemba' },
  { id: 'com-2', cityId: 'city-1', name: 'Katuba' },
];

/** Lookups resolve from the tables above; writes resolve to the sent body. */
function stubApi() {
  mocks.apiFetch.mockImplementation(
    (path: string, init?: { method?: string; body?: string }) => {
      if (path === '/v1/cities') return Promise.resolve({ data: CITIES });
      if (path.endsWith('/communes')) return Promise.resolve({ data: COMMUNES });
      const body = init?.body ? JSON.parse(init.body) : {};
      return Promise.resolve({ data: { id: 'addr-1', ...body } });
    },
  );
}

/** The write call — the lookups are GETs with no init. */
function writeCall() {
  return mocks.apiFetch.mock.calls.find((c) => c[1]?.method);
}

function sentBody() {
  const call = writeCall();
  return call ? JSON.parse(call[1].body as string) : null;
}

beforeEach(() => {
  mocks.apiFetch.mockReset();
  stubApi();
});

describe('AddressForm — create', () => {
  it('sends reference and recipientPhone, never details/phone', async () => {
    const user = userEvent.setup();
    render(<AddressForm onSaved={() => {}} onCancel={() => {}} />);

    await screen.findByRole('combobox', { name: /Ville/i });
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Ville/i }),
      'city-1',
    );
    await user.selectOptions(
      await screen.findByRole('combobox', { name: /Commune/i }),
      'com-1',
    );

    await user.type(
      screen.getByLabelText('Point de repère'),
      'En face de la pharmacie',
    );
    await user.type(
      screen.getByLabelText('Téléphone du destinataire'),
      '+243990000001',
    );
    await user.click(screen.getByRole('button', { name: /Enregistrer/i }));

    await waitFor(() => expect(writeCall()).toBeTruthy());
    const body = sentBody();
    expect(body.reference).toBe('En face de la pharmacie');
    expect(body.recipientPhone).toBe('+243990000001');
    // The exact keys that used to 400.
    expect(body).not.toHaveProperty('details');
    expect(body).not.toHaveProperty('phone');
  });

  it('POSTs to /v1/addresses with the taxonomy ids and names', async () => {
    const user = userEvent.setup();
    render(<AddressForm onSaved={() => {}} onCancel={() => {}} />);

    await screen.findByRole('combobox', { name: /Ville/i });
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Ville/i }),
      'city-1',
    );
    await user.selectOptions(
      await screen.findByRole('combobox', { name: /Commune/i }),
      'com-1',
    );
    await user.click(screen.getByRole('button', { name: /Enregistrer/i }));

    await waitFor(() => expect(writeCall()).toBeTruthy());
    const call = writeCall()!;
    expect(call[0]).toBe('/v1/addresses');
    expect(call[1].method).toBe('POST');
    expect(sentBody()).toMatchObject({
      town: 'Lubumbashi',
      province: 'Haut-Katanga',
      neighborhood: 'Kampemba',
      cityId: 'city-1',
      communeId: 'com-1',
    });
  });

  it('disables save until a city and commune are chosen', async () => {
    render(<AddressForm onSaved={() => {}} onCancel={() => {}} />);
    await screen.findByRole('combobox', { name: /Ville/i });
    expect(screen.getByRole('button', { name: /Enregistrer/i })).toBeDisabled();
  });
});

describe('AddressForm — edit', () => {
  const existing = {
    id: 'addr-1',
    recipientName: 'Jean Kabila',
    recipientPhone: '+243990000001',
    province: 'Haut-Katanga',
    town: 'Lubumbashi',
    neighborhood: 'Kampemba',
    avenue: 'Av. Lumumba 24',
    reference: 'Ancien repère',
    cityId: 'city-1',
    communeId: 'com-1',
    isDefault: true,
  };

  it('prefills and PATCHes the existing address', async () => {
    const user = userEvent.setup();
    render(
      <AddressForm initial={existing} onSaved={() => {}} onCancel={() => {}} />,
    );

    expect(await screen.findByDisplayValue('Av. Lumumba 24')).toBeTruthy();
    expect(screen.getByDisplayValue('Ancien repère')).toBeTruthy();
    expect(screen.getByText('Modifier mon adresse')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Enregistrer/i }));

    await waitFor(() => expect(writeCall()).toBeTruthy());
    const call = writeCall()!;
    expect(call[0]).toBe('/v1/addresses/addr-1');
    expect(call[1].method).toBe('PATCH');
  });

  it('sends an explicit null when a field is cleared', async () => {
    // Prisma ignores `undefined`, so omitting the key would silently keep the
    // old landmark and clearing it would appear to do nothing.
    const user = userEvent.setup();
    render(
      <AddressForm initial={existing} onSaved={() => {}} onCancel={() => {}} />,
    );

    const reference = await screen.findByDisplayValue('Ancien repère');
    await user.clear(reference);
    await user.click(screen.getByRole('button', { name: /Enregistrer/i }));

    await waitFor(() => expect(writeCall()).toBeTruthy());
    const body = sentBody();
    expect(Object.keys(body)).toContain('reference');
    expect(body.reference).toBeNull();
  });
});
