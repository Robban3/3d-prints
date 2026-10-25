import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ResponsiveImage } from '../src/components/ResponsiveImage';

afterEach(cleanup);

describe('responsive public images', () => {
  it.each(['d653f06c32916e870f1a8776c42acae6', '399ff821e1c39e58582e2021da57de4d'])('resolves exported upload %s directly to public optimized photos', id => {
    render(<ResponsiveImage src={`/api/uploads/${id}`} alt="Produkt" sizes="64px" />);
    expect(screen.getByRole('img').getAttribute('src')).toMatch(/^\/images\/responsive\//);
    expect(screen.getByRole('img').getAttribute('srcset')).not.toContain('/api/');
  });
  it('uses mobile variants for uploaded product photos without changing private downloads', () => {
    render(<ResponsiveImage src="/api/uploads/0123456789abcdef0123456789abcdef" alt="Produkt" sizes="45vw" loading="lazy" />);
    const image = screen.getByRole('img');
    expect(image).toHaveAttribute('src', '/api/uploads/0123456789abcdef0123456789abcdef/image/960');
    expect(image.getAttribute('srcset')).toContain('/image/320 320w');
    expect(image).toHaveAttribute('sizes', '45vw');
  });
  it('offers smaller public hero sizes and preserves eager loading priority', () => {
    render(<ResponsiveImage src="/images/themes/nordic-reference.png" alt="Kampanj" sizes="100vw" loading="eager" fetchPriority="high" />);
    const image = screen.getByRole('img');
    expect(image.getAttribute('src')).toMatch(/^\/images\/responsive\/[a-f0-9]+-1536\.webp$/);
    expect(image.getAttribute('srcset')).toContain('320w');
    expect(image.getAttribute('srcset')).toContain('640w');
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('fetchpriority', 'high');
  });

  it('keeps unknown and protected URLs intact without generating public variants', () => {
    render(<ResponsiveImage src="/api/admin/files/private-file/download" alt="Privat" />);
    const image = screen.getByRole('img');
    expect(image).toHaveAttribute('src', '/api/admin/files/private-file/download');
    expect(image).not.toHaveAttribute('srcset');
    expect(image).not.toHaveAttribute('sizes');
  });
});
