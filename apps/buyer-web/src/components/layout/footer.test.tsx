import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Footer } from './footer';

describe('Footer store badges', () => {
  it('links App Store then Google Play to the real listings, without leaving the page', () => {
    render(<Footer initialCities={[]} />);
    const footer = screen.getByRole('contentinfo');
    const apple = within(footer).getByRole('link', { name: 'Télécharger Teka RDC dans l’App Store' });
    const play = within(footer).getByRole('link', { name: 'Télécharger Teka RDC sur Google Play' });

    expect(apple).toHaveAttribute('href', 'https://apps.apple.com/us/app/teka/id6787126945');
    expect(play).toHaveAttribute('href', 'https://play.google.com/store/apps/details?id=com.tootiye.teka');
    for (const link of [apple, play]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(apple.compareDocumentPosition(play) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
