import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { JsonLd, serializeJsonLd } from './json-ld';

const hostile = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Robe </script><script>alert(1)</script>',
  description: 'ligne1\u2028ligne2 <!-- --> & "quotes"',
  brand: { '@type': 'Brand', name: '<img src=x onerror=alert(2)>' },
};

describe('serializeJsonLd', () => {
  it('never emits a literal </script, <!-- or bare < > & (seller text cannot break out)', () => {
    const out = serializeJsonLd(hostile);
    expect(out).not.toMatch(/<\/script/i);
    expect(out).not.toContain('<!--');
    expect(out).not.toMatch(/[<>&]/);
    expect(out).not.toContain('\u2028');
    expect(out).not.toContain('\u2029');
  });

  it('stays valid JSON that round-trips to the original data (no SEO cost)', () => {
    expect(JSON.parse(serializeJsonLd(hostile))).toEqual(hostile);
  });
});

describe('JsonLd', () => {
  it('renders one application/ld+json script whose text parses back to the data', () => {
    const { container } = render(<JsonLd data={hostile} />);
    const scripts = container.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts.length).toBe(1);
    expect(container.innerHTML).not.toMatch(/<\/script>.*<script/i);
    expect(JSON.parse(scripts[0].textContent ?? '')).toEqual(hostile);
  });
});
