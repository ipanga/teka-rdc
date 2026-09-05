import { describe, expect, it } from 'vitest';
import { scrubPosthogEvent } from './posthog-scrub';

describe('scrubPosthogEvent', () => {
  it('strips phones and seller-document download links from every property, at any depth', () => {
    const event = {
      event: '$autocapture',
      properties: {
        $current_url: 'http://localhost:5200/dashboard/sellers/abc',
        $elements: [{ attr__href: 'https://api.cloudinary.com/v1_1/teka/image/download?api_key=1&signature=abc&public_id=teka-rdc/seller-documents/p/d' }],
        note: 'Appelé au +243999000796',
      },
    } as never;
    const out = scrubPosthogEvent(event) as unknown as { properties: Record<string, unknown> };
    expect(JSON.stringify(out.properties)).not.toMatch(/cloudinary|signature|\\+243/);
    expect((out.properties.$elements as Array<{ attr__href: string }>)[0].attr__href).toBe('[document-link]');
    expect(out.properties.note).toBe('Appelé au [phone]');
    expect(out.properties.$current_url).toBe('http://localhost:5200/dashboard/sellers/abc');
  });

  it('passes null through', () => {
    expect(scrubPosthogEvent(null)).toBeNull();
  });
});
