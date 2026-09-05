import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SellerBadge, VERIFIED_HELP, sellerBadgeKind } from './seller-badge';

describe('SellerBadge', () => {
  it('renders « Vérifié » only when the API flag is true', () => {
    const { container } = render(<SellerBadge seller={{ verified: true, official: false }} />);
    expect(screen.getByText('Vérifié')).toBeTruthy();
    expect(container.querySelector('[data-testid="seller-badge-verified"]')?.getAttribute('title')).toBe(VERIFIED_HELP);
    expect(screen.getByLabelText(/Vendeur vérifié/)).toBeTruthy();
  });

  it('renders nothing for an unverified seller — never a public « Non vérifié », and never from the name', () => {
    for (const seller of [{ verified: false, official: false }, {}, null, undefined]) {
      const { container, unmount } = render(<SellerBadge seller={seller} />);
      expect(container.innerHTML).toBe('');
      unmount();
    }
    const { container } = render(<SellerBadge seller={{ businessName: 'Teka RDC Officiel' } as never} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows one badge: Officiel takes precedence over Vérifié', () => {
    render(<SellerBadge seller={{ verified: true, official: true }} />);
    expect(screen.getByText('Officiel')).toBeTruthy();
    expect(screen.queryByText('Vérifié')).toBeNull();
    expect(sellerBadgeKind({ verified: true, official: true })).toBe('official');
    expect(sellerBadgeKind({ verified: true })).toBe('verified');
    expect(sellerBadgeKind({})).toBeNull();
  });

  it('is not colour-only: icon + text, and the help text makes no guarantee', () => {
    const { container } = render(<SellerBadge seller={{ verified: true }} />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(VERIFIED_HELP).not.toMatch(/garanti|certifi|gouvernement|authentique/i);
  });
});
