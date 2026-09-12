import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// The input lives inside a <form onSubmit={goToSearch}>. Enter used to reach
// goToSearch TWICE for one keypress: once from onKeyDown (which called it
// without an event, so its `e?.preventDefault()` no-opped) and once from the
// browser's own submit. Two router.push calls meant two history entries, so
// one Back press appeared to do nothing.
const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
// No suggestion dropdown: keep the test on the `!open` branch, which is the
// one that was double-firing. A rejected fetch leaves `open` false.
vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn().mockRejectedValue(new Error('no suggestions')) }));

import { SearchAutocomplete } from './search-autocomplete';

function renderSearch() {
  return render(
    <SearchAutocomplete placeholder="Rechercher" categoryLabel="Toutes" cityId={null} citySlug={null} />,
  );
}

describe('SearchAutocomplete — Enter navigates exactly once', () => {
  beforeEach(() => {
    mocks.push.mockClear();
    try { localStorage.clear(); } catch { /* jsdom without storage */ }
  });

  it('pushes ONE search route for one Enter press', async () => {
    const user = userEvent.setup();
    renderSearch();

    await user.type(screen.getByPlaceholderText('Rechercher'), 'huile');
    await user.keyboard('{Enter}');

    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith('/recherche?q=huile');
  });

  it('pushes ONE route when the form is submitted directly', async () => {
    const user = userEvent.setup();
    const { container } = renderSearch();

    await user.type(screen.getByPlaceholderText('Rechercher'), 'savon');
    const form = container.querySelector('form')!;
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it('encodes accents and spaces, and ignores a blank term', async () => {
    const user = userEvent.setup();
    renderSearch();
    const input = screen.getByPlaceholderText('Rechercher');

    await user.keyboard('{Enter}');
    expect(mocks.push).not.toHaveBeenCalled();

    await user.type(input, '  huile de palme  ');
    await user.keyboard('{Enter}');
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith('/recherche?q=huile%20de%20palme');
  });
});
