import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { HeroMedia } from '../src/components/HeroMedia';
import { CampaignBlock } from '../src/components/CampaignBlock';
import type { Campaign, Media } from '../src/types';

const image: Media = {
  kind: 'image',
  id: 'a'.repeat(32),
  url: '/api/uploads/bild',
  fileName: 'hero.webp',
};
const video: Media = {
  kind: 'video',
  id: 'b'.repeat(32),
  url: '/api/uploads/video',
  fileName: 'hero.mp4',
};

const originalMatchMedia = window.matchMedia;

/** Låter testet bestämma om systemet ber om minskad rörelse. */
function setReducedMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reduced : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

function withRouter(element: ReactElement) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}

describe('HeroMedia', () => {
  it('visar en bild som bild', () => {
    setReducedMotion(false);
    const { container } = render(<HeroMedia media={image} autoplay />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/api/uploads/bild');
    // Dekorativ: rubriken intill bär betydelsen.
    expect(img.getAttribute('alt')).toBe('');
    expect(container.querySelector('video')).toBeNull();
  });

  it('spelar videon ljudlöst i loop', () => {
    setReducedMotion(false);
    const { container } = render(<HeroMedia media={video} autoplay />);
    const element = container.querySelector('video')!;
    expect(element.getAttribute('src')).toBe('/api/uploads/video');
    expect(element).toHaveProperty('autoplay', true);
    expect(element).toHaveProperty('muted', true);
    expect(element).toHaveProperty('loop', true);
    // Autospelande bakgrundsvideo ska inte ha kontroller.
    expect(element).toHaveProperty('controls', false);
  });

  it('sätter stillbilden som poster', () => {
    setReducedMotion(false);
    const { container } = render(<HeroMedia media={video} poster={image} autoplay />);
    expect(container.querySelector('video')!.getAttribute('poster')).toBe('/api/uploads/bild');
  });

  it('spelar inte av sig själv när autospel är avstängt', () => {
    setReducedMotion(false);
    const { container } = render(<HeroMedia media={video} autoplay={false} />);
    const element = container.querySelector('video')!;
    expect(element).toHaveProperty('autoplay', false);
    // Då behövs kontroller, annars går videon inte att se alls.
    expect(element).toHaveProperty('controls', true);
  });

  it('respekterar önskan om minskad rörelse', () => {
    setReducedMotion(true);
    const { container } = render(<HeroMedia media={video} autoplay />);
    const element = container.querySelector('video')!;
    expect(element).toHaveProperty('autoplay', false);
    expect(element).toHaveProperty('controls', true);
  });
});

describe('CampaignBlock', () => {
  const campaign: Campaign = {
    id: 'k1',
    title: 'Höstkampanj',
    text: '20 % på allt i oktober.',
    layout: 'banner',
    active: true,
    order: 0,
  };

  it('visar rubrik och text', () => {
    withRouter(<CampaignBlock campaign={campaign} />);
    expect(screen.getByText('Höstkampanj')).toBeInTheDocument();
    expect(screen.getByText('20 % på allt i oktober.')).toBeInTheDocument();
  });

  it('visar överraden ovanför rubriken', () => {
    withRouter(<CampaignBlock campaign={{ ...campaign, eyebrow: 'Julkollektionen' }} />);
    expect(screen.getByText('Julkollektionen')).toBeInTheDocument();
  });

  it('visar ingen överrad när den inte satts', () => {
    const { container } = withRouter(<CampaignBlock campaign={campaign} />);
    expect(container.querySelector('.eyebrow')).toBeNull();
  });

  it('visar en bild som följer med bygget', () => {
    const { container } = withRouter(
      <CampaignBlock
        campaign={{
          ...campaign,
          media: {
            kind: 'image',
            id: '',
            url: '/kampanjer/julkollektionen.jpg',
            fileName: 'julkollektionen.jpg',
          },
        }}
      />,
    );
    expect(container.querySelector('img.campaign-media')).toHaveAttribute(
      'src',
      '/kampanjer/julkollektionen.jpg',
    );
  });

  it('visar rabattkoden när kampanjen hör till en', () => {
    withRouter(<CampaignBlock campaign={{ ...campaign, discountCode: 'HOST20' }} />);
    expect(screen.getByText('HOST20')).toBeInTheDocument();
  });

  it('gör en intern knapp till en routerlänk', () => {
    withRouter(
      <CampaignBlock campaign={{ ...campaign, cta: { label: 'Se allt', href: '/produkter' } }} />,
    );
    const link = screen.getByRole('link', { name: /Se allt/ });
    expect(link).toHaveAttribute('href', '/produkter');
    expect(link).not.toHaveAttribute('rel');
  });

  it('gör en extern knapp till en vanlig länk med rel', () => {
    withRouter(
      <CampaignBlock
        campaign={{ ...campaign, cta: { label: 'Läs mer', href: 'https://exempel.se' } }}
      />,
    );
    const link = screen.getByRole('link', { name: /Läs mer/ });
    expect(link).toHaveAttribute('href', 'https://exempel.se');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('visar ingen knapp när kampanjen saknar en', () => {
    withRouter(<CampaignBlock campaign={campaign} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('ritar media som bild eller video', () => {
    const { container: medBild } = withRouter(
      <CampaignBlock campaign={{ ...campaign, media: image }} />,
    );
    expect(medBild.querySelector('img.campaign-media')).not.toBeNull();

    const { container: medVideo } = withRouter(
      <CampaignBlock campaign={{ ...campaign, media: video }} />,
    );
    expect(medVideo.querySelector('video.campaign-media')).not.toBeNull();
  });

  it('märker upp layouten med en klass', () => {
    const { container } = withRouter(<CampaignBlock campaign={{ ...campaign, layout: 'kort' }} />);
    expect(container.querySelector('.campaign-kort')).not.toBeNull();
  });
});
