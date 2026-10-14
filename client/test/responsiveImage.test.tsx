import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ResponsiveImage } from '../src/components/ResponsiveImage';

afterEach(cleanup);

describe('responsive public images', () => {
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
