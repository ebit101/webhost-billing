import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { webBrandingSchema } from '../src';

describe('public installation branding contract', () => {
  it('accepts plain names and safe optional public contact information', () => {
    const brand = webBrandingSchema.parse({
      name: ' Example Hosting ',
      logoPath: '/branding/example-logo.png',
      contactEmail: 'billing@example.test',
      contactPhone: '+8801700000000',
      contactAddress: 'Example Tower, Dhaka',
      website: 'https://example.test/',
      tagline: 'A focused hosting team',
      logoWidth: '285',
      logoHeight: '63',
    });
    assert.equal(brand.name, 'Example Hosting');
    assert.equal(brand.logoWidth, 285);
    assert.equal(brand.logoHeight, 63);
  });

  it('rejects remote, encoded, traversal, active-format and query-bearing logos', () => {
    for (const logoPath of [
      'https://example.test/logo.png',
      '//example.test/logo.png',
      '/branding/../logo.png',
      '/branding/%2e%2e.png',
      '/branding/logo.svg',
      '/branding/logo.png?x=1',
      '/branding/logo.png#x',
      '/branding/nested/logo.png',
      '/branding\\logo.png',
      'data:image/png;base64,AA',
    ])
      assert.equal(
        webBrandingSchema.safeParse({ name: 'Example', logoPath }).success,
        false,
      );
  });

  it('rejects dangerous links, invalid dimensions, markup and unknown fields', () => {
    for (const input of [
      { website: 'javascript:alert(1)' },
      { website: 'http://example.test/' },
      { website: 'https://user:password@example.test/' },
      { website: 'https://example.test/?token=secret' },
      { contactEmail: 'billing@example.test?subject=bad' },
      { contactPhone: '+8801700000000\r\nextra' },
      { logoWidth: 0 },
      { logoHeight: 2049 },
      { logoWidth: 'NaN' },
      { name: '<script>' },
      { name: '%s' },
      { name: 'Example\nHost' },
      { contactAddress: '<b>Example</b>' },
      { secret: 'not-public' },
    ])
      assert.equal(
        webBrandingSchema.safeParse({ name: 'Example', ...input }).success,
        false,
      );
  });
});
