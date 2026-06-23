import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const LUB = { id: 'c1', name: 'Lubumbashi', province: 'Haut-Katanga', isActive: true, sortOrder: 1 };
const KOL = { id: 'c2', name: 'Kolwezi', province: 'Lualaba', isActive: true, sortOrder: 2 };
const INACTIVE = { id: 'c3', name: 'Goma', province: 'Nord-Kivu', isActive: false, sortOrder: 3 };

const mocks = vi.hoisted(() => ({
  selectTown: vi.fn(),
  state: {
    selectedCity: null as unknown,
    cities: [] as unknown[],
  },
}));

vi.mock('@/lib/city-store', () => ({
  useCityStore: () => ({
    selectedCity: mocks.state.selectedCity,
    cities: mocks.state.cities,
  }),
}));
// CityPrompt selects a town via the shared useSelectTown hook (persist +
// centralized routing). Mock it so the test stays decoupled from the router.
vi.mock('@/lib/use-select-town', () => ({
  useSelectTown: () => mocks.selectTown,
}));

import { CityPrompt } from './city-prompt';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state = { selectedCity: null, cities: [LUB, KOL, INACTIVE] };
});

describe('CityPrompt', () => {
  it('renders one button per ACTIVE city when no city is selected', () => {
    render(<CityPrompt />);
    expect(screen.getByRole('button', { name: 'Lubumbashi' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kolwezi' })).toBeInTheDocument();
    // inactive city is never offered
    expect(screen.queryByRole('button', { name: 'Goma' })).not.toBeInTheDocument();
  });

  it('clicking a city button selects that town', async () => {
    render(<CityPrompt />);
    await userEvent.click(screen.getByRole('button', { name: 'Kolwezi' }));
    expect(mocks.selectTown).toHaveBeenCalledWith(KOL);
  });

  it('renders nothing once a city is selected (non-blocking, no nag)', () => {
    mocks.state = { selectedCity: LUB, cities: [LUB, KOL] };
    const { container } = render(<CityPrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the city list has not loaded', () => {
    mocks.state = { selectedCity: null, cities: [] };
    const { container } = render(<CityPrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('dismissing ("seeAll") hides the prompt (browse all cities)', async () => {
    const { container } = render(<CityPrompt />);
    await userEvent.click(screen.getByRole('button', { name: 'Voir toutes les villes' }));
    expect(container).toBeEmptyDOMElement();
    expect(mocks.selectTown).not.toHaveBeenCalled();
  });
});
