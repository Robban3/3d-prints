import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { ProductCard } from '../src/components/ProductCard';
import { OrderTimeline } from '../src/components/OrderTimeline';
import { UploadDropzone } from '../src/components/UploadDropzone';
import { ModelFacts } from '../src/components/ModelFacts';
import { CartProvider } from '../src/lib/cart';
import type { AnyOrder, ModelAnalysis, Product } from '../src/types';

const product: Product = {
  id: 'p-001',
  slug: 'terra-vaxtkruka',
  name: 'Terra växtkruka',
  tagline: 'Fasetterad kruka med inbyggt vattenfat',
  description: 'En kruka.',
  category: 'inredning',
  price: 349,
  material: 'petg',
  finish: 'Matte',
  printTimeHours: 9,
  dimensions: { width: 140, depth: 140, height: 155 },
  weightGrams: 210,
  colors: ['Lermatt', 'Grafit'],
  sizes: [{ id: 'mellan', name: 'Mellan', priceDelta: 0 }],
  highlights: [],
  stock: 24,
  rating: 4.8,
  reviewCount: 63,
  featured: true,
  art: { shape: 'planter', tone: 'benvit' },
};

const renderWithRouter = (ui: ReactElement) =>
  render(
    <MemoryRouter>
      <CartProvider>{ui}</CartProvider>
    </MemoryRouter>,
  );

describe('ProductCard', () => {
  it('visar namn, material med finish och pris', () => {
    renderWithRouter(<ProductCard product={product} />);
    expect(screen.getByText('Terra växtkruka')).toBeInTheDocument();
    expect(screen.getByText('PETG Matte')).toBeInTheDocument();
    expect(screen.getByText(/349/)).toBeInTheDocument();
  });

  it('flaggar lågt lagersaldo', () => {
    renderWithRouter(<ProductCard product={{ ...product, stock: 8 }} />);
    expect(screen.getByText('Få kvar')).toBeInTheDocument();
  });

  it('flaggar inte när lagret är gott', () => {
    renderWithRouter(<ProductCard product={{ ...product, stock: 40 }} />);
    expect(screen.queryByText('Få kvar')).not.toBeInTheDocument();
  });

  it('lägger produkten i varukorgen från snabbköpsknappen', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ProductCard product={product} />);
    await user.click(screen.getByRole('button', { name: /Lägg Terra växtkruka i varukorgen/i }));
    await waitFor(() => {
      const stored = window.localStorage.getItem('formlabb.cart.v1');
      expect(stored).toContain('p-001');
    });
  });
});

const order: AnyOrder = {
  id: 'S2026-ABC123',
  type: 'shop',
  createdAt: '2026-09-05T10:00:00.000Z',
  status: 'skickad',
  history: [
    { status: 'mottagen', at: '2026-09-05T10:00:00.000Z' },
    { status: 'i_produktion', at: '2026-09-05T11:00:00.000Z' },
    { status: 'skickad', at: '2026-09-06T09:00:00.000Z', note: 'Spårning 123456' },
  ],
  customer: {
    name: 'Anna Andersson',
    email: 'anna@example.com',
    address: 'Storgatan 1',
    postalCode: '11234',
    city: 'Stockholm',
  },
  lines: [],
  subtotal: 698,
  shipping: 0,
  total: 698,
};

describe('OrderTimeline', () => {
  it('visar alla fyra steg', () => {
    const { container } = render(<OrderTimeline order={order} />);
    expect(container.querySelectorAll('.timeline-step')).toHaveLength(4);
  });

  it('markerar passerade steg och var ordern står nu', () => {
    const { container } = render(<OrderTimeline order={order} />);
    expect(container.querySelectorAll('.timeline-step.done')).toHaveLength(2);
    expect(container.querySelectorAll('.timeline-step.current')).toHaveLength(1);
    expect(container.querySelectorAll('.timeline-step.pending')).toHaveLength(1);
  });

  it('visar verkstadens anteckning', () => {
    render(<OrderTimeline order={order} />);
    expect(screen.getByText('Spårning 123456')).toBeInTheDocument();
  });

  it('visar en avbrottsruta i stället för tidslinjen', () => {
    const { container } = render(
      <OrderTimeline
        order={{
          ...order,
          status: 'avbruten',
          history: [
            ...order.history,
            { status: 'avbruten', at: '2026-09-07T08:00:00.000Z', note: 'Kunden ångrade sig' },
          ],
        }}
      />,
    );
    expect(container.querySelectorAll('.timeline-step')).toHaveLength(0);
    expect(screen.getByText(/Ordern är avbruten/)).toBeInTheDocument();
    expect(screen.getByText('Kunden ångrade sig')).toBeInTheDocument();
  });
});

describe('UploadDropzone', () => {
  const accepted = ['.stl', '.obj', '.3mf'];

  it('avvisar ett format vi inte printar', async () => {
    const onUploaded = vi.fn();
    const { container } = render(
      <UploadDropzone
        accepted={accepted}
        maxBytes={1024 * 1024}
        uploaded={null}
        onUploaded={onUploaded}
      />,
    );
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    // accept-attributet filtrerar bort filen i filväljaren, men drag-and-drop
    // gör det inte – därför måste komponentens egen kontroll fånga den. Filen
    // läggs på inputen direkt, precis som ett släpp gör.
    const file = new File(['x'], 'skadlig.exe', { type: 'application/octet-stream' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);
    expect(await screen.findByText(/Filformatet stöds inte/)).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('avvisar en fil som är för stor', async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();
    const { container } = render(
      <UploadDropzone accepted={accepted} maxBytes={10} uploaded={null} onUploaded={onUploaded} />,
    );
    const input = container.querySelector('input[type=file]') as HTMLInputElement;
    await user.upload(input, new File(['x'.repeat(200)], 'modell.stl'));
    expect(await screen.findByText(/större än/)).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('visar den uppladdade filen med storlek', () => {
    render(
      <UploadDropzone
        accepted={accepted}
        maxBytes={1024 * 1024}
        uploaded={{ id: 'abc', fileName: 'modell.stl', size: 42025, url: '/api/uploads/abc' }}
        onUploaded={vi.fn()}
      />,
    );
    expect(screen.getByText('modell.stl')).toBeInTheDocument();
    expect(screen.getByText(/uppladdad och sparad/)).toBeInTheDocument();
  });

  it('visar felet som servern skickat med', () => {
    render(
      <UploadDropzone
        accepted={accepted}
        maxBytes={1024 * 1024}
        uploaded={null}
        onUploaded={vi.fn()}
        error="Vi hittar inte din uppladdade fil."
      />,
    );
    expect(screen.getByText('Vi hittar inte din uppladdade fil.')).toBeInTheDocument();
  });
});

describe('ModelFacts', () => {
  const analysis: ModelAnalysis = {
    format: 'stl',
    volumeCm3: 27.5,
    surfaceAreaCm2: 54,
    bounds: { width: 30.5, depth: 30, height: 30 },
    triangles: 1248,
    openEdges: 0,
    nonManifoldEdges: 0,
    watertight: true,
    invertedNormals: false,
    fitsBuildPlate: true,
    warnings: [],
  };

  it('visar volym, mått och att meshen är sluten', () => {
    render(<ModelFacts analysis={analysis} />);
    expect(screen.getByText('27,5 cm³')).toBeInTheDocument();
    expect(screen.getByText('30,5 × 30 × 30 mm')).toBeInTheDocument();
    expect(screen.getByText('Sluten och klar att slica')).toBeInTheDocument();
    expect(screen.getByText(/filens verkliga volym/)).toBeInTheDocument();
  });

  it('listar varningarna med rätt allvarsgrad', () => {
    const { container } = render(
      <ModelFacts
        analysis={{
          ...analysis,
          watertight: false,
          openEdges: 4,
          fitsBuildPlate: false,
          warnings: [
            { code: 'for-stor', severity: 'error', message: 'Modellen är större än byggvolymen.' },
            { code: 'inte-tat', severity: 'warning', message: 'Meshen har 4 öppna kanter.' },
          ],
        }}
      />,
    );
    expect(container.querySelectorAll('.model-warning.error')).toHaveLength(1);
    expect(container.querySelectorAll('.model-warning.warning')).toHaveLength(1);
    expect(screen.getByText('Behöver lagas – se nedan')).toBeInTheDocument();
    // Den lugnande texten ska inte stå kvar när det finns varningar.
    expect(screen.queryByText(/filens verkliga volym/)).not.toBeInTheDocument();
  });

  it('säger att tätheten inte kontrollerats för en tung mesh', () => {
    render(
      <ModelFacts
        analysis={{ ...analysis, watertight: null, openEdges: null, nonManifoldEdges: null }}
      />,
    );
    expect(screen.getByText('För tung att kontrollera')).toBeInTheDocument();
  });
});
