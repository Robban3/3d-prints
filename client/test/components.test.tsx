import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { ProductCard } from '../src/components/ProductCard';
import { OrderTimeline } from '../src/components/OrderTimeline';
import { UploadDropzone } from '../src/components/UploadDropzone';
import { ModelFacts } from '../src/components/ModelFacts';
import { DiscountField } from '../src/components/DiscountField';
import { ModelPanel } from '../src/components/ModelPanel';
import { QuoteSummary } from '../src/components/QuoteSummary';
import { ShippingPicker } from '../src/components/ShippingPicker';
import { ReviewSection } from '../src/components/ReviewSection';
import { StockWatchForm } from '../src/components/StockWatchForm';
import { CartProvider } from '../src/lib/cart';
import type { AnyOrder, ModelAnalysis, Product, Review, ShippingOption } from '../src/types';

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

describe('ReviewSection', () => {
  const reviews: Review[] = [
    {
      id: 'r1',
      createdAt: '2026-09-20T10:00:00.000Z',
      author: 'Anna',
      rating: 5,
      title: 'Perfekt passform',
      body: 'Ytan är helt jämn och måtten stämmer.',
      verifiedPurchase: true,
      reply: 'Tack Anna!',
    },
    {
      id: 'r2',
      createdAt: '2026-09-18T10:00:00.000Z',
      author: 'Bo',
      rating: 3,
      title: '',
      body: 'Bra men lite blank yta.',
      verifiedPurchase: false,
    },
  ];

  const summary = { average: 4, count: 2, distribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 } };

  it('visar snittbetyget och antalet omdömen', () => {
    render(<ReviewSection slug="terra-vaxtkruka" reviews={reviews} summary={summary} />);
    expect(screen.getByText('4,0')).toBeInTheDocument();
    expect(screen.getByText('2 omdömen')).toBeInTheDocument();
  });

  it('listar omdömena med verifieringsmärke och svar', () => {
    render(<ReviewSection slug="terra-vaxtkruka" reviews={reviews} summary={summary} />);
    expect(screen.getByText('Perfekt passform')).toBeInTheDocument();
    expect(screen.getByText('Bra men lite blank yta.')).toBeInTheDocument();
    expect(screen.getByText('Verifierat köp')).toBeInTheDocument();
    expect(screen.getByText(/Tack Anna!/)).toBeInTheDocument();
  });

  it('böjer ordet rätt för ett enda omdöme', () => {
    render(
      <ReviewSection
        slug="terra-vaxtkruka"
        reviews={[reviews[0]!]}
        summary={{ average: 5, count: 1, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 } }}
      />,
    );
    expect(screen.getByText('1 omdöme')).toBeInTheDocument();
  });

  it('säger att ingen lämnat omdöme när listan är tom', () => {
    render(<ReviewSection slug="terra-vaxtkruka" reviews={[]} summary={null} />);
    expect(screen.getByText(/Ingen har lämnat ett omdöme/)).toBeInTheDocument();
  });

  it('öppnar formuläret och säger att omdömet granskas först', async () => {
    render(<ReviewSection slug="terra-vaxtkruka" reviews={[]} summary={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Skriv ett omdöme' }));
    expect(screen.getByLabelText('Ditt omdöme')).toBeInTheDocument();
    expect(screen.getByText('Omdömet granskas innan det publiceras.')).toBeInTheDocument();
  });

  it('markerar valt betyg i stjärnorna', async () => {
    render(<ReviewSection slug="terra-vaxtkruka" reviews={[]} summary={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Skriv ett omdöme' }));
    await userEvent.click(screen.getByRole('radio', { name: '4 av 5' }));
    expect(screen.getByRole('radio', { name: '4 av 5' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '5 av 5' })).toHaveAttribute('aria-checked', 'false');
  });

  it('visar serverns fältfel vid sidan om formuläret', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({ error: 'Omdömet kunde inte sparas', fields: { body: 'Berätta mer.' } }),
    } as unknown as Response);

    render(<ReviewSection slug="terra-vaxtkruka" reviews={[]} summary={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Skriv ett omdöme' }));
    fireEvent.submit(screen.getByRole('button', { name: 'Skicka omdömet' }));
    await waitFor(() => expect(screen.getByText('Berätta mer.')).toBeInTheDocument());

    global.fetch = originalFetch;
  });
});

describe('StockWatchForm', () => {
  it('bekräftar att det blir ett enda mejl', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ watching: true, productName: 'Terra växtkruka' }),
    } as unknown as Response);

    render(<StockWatchForm slug="terra-vaxtkruka" />);
    await userEvent.type(screen.getByLabelText('Mejladress'), 'anna@example.com');
    fireEvent.submit(screen.getByRole('button', { name: 'Meddela mig' }));
    await waitFor(() => expect(screen.getByText(/Vi hör av oss/)).toBeInTheDocument());

    global.fetch = originalFetch;
  });

  it('visar felet när adressen inte duger', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          error: 'Bevakningen kunde inte sparas',
          fields: { email: 'Fyll i en mejladress vi kan skicka beskedet till.' },
        }),
    } as unknown as Response);

    render(<StockWatchForm slug="terra-vaxtkruka" />);
    fireEvent.submit(screen.getByRole('button', { name: 'Meddela mig' }));
    await waitFor(() =>
      expect(
        screen.getByText('Fyll i en mejladress vi kan skicka beskedet till.'),
      ).toBeInTheDocument(),
    );

    global.fetch = originalFetch;
  });
});

describe('ModelPanel', () => {
  const model: ModelAnalysis = {
    format: 'stl',
    volumeCm3: 27.5,
    surfaceAreaCm2: 54,
    bounds: { width: 30, depth: 30, height: 30 },
    triangles: 1248,
    openEdges: 0,
    nonManifoldEdges: 0,
    watertight: true,
    invertedNormals: false,
    fitsBuildPlate: true,
    warnings: [],
  };

  it('visar filen och uppmätningen', () => {
    render(
      <ModelPanel
        fileName="faste.stl"
        fileUrl="/api/uploads/abc"
        fileSize={2048}
        model={model}
        collapsible
      />,
    );
    expect(screen.getByRole('link', { name: 'faste.stl' })).toHaveAttribute(
      'href',
      '/api/uploads/abc',
    );
    expect(screen.getByText('27,5 cm³')).toBeInTheDocument();
  });

  it('ritar inte 3D-vyn förrän någon ber om den', async () => {
    const { container } = render(
      <ModelPanel fileName="faste.stl" fileUrl="/api/uploads/abc" model={model} collapsible />,
    );
    // Varje vy tar ett eget WebGL-sammanhang, så en lista får inte öppna alla.
    expect(container.querySelector('.model-viewer')).toBeNull();
    expect(screen.getByRole('button', { name: 'Visa modellen i 3D' })).toBeInTheDocument();
  });

  it('erbjuder ingen 3D-vy för ett format vi inte kan rita', () => {
    render(<ModelPanel fileName="ritning.step" fileUrl="/api/uploads/abc" collapsible />);
    expect(screen.queryByRole('button', { name: 'Visa modellen i 3D' })).toBeNull();
    expect(screen.getByRole('link', { name: 'ritning.step' })).toBeInTheDocument();
  });

  it('erbjuder ingen 3D-vy när filen inte finns kvar', () => {
    render(<ModelPanel fileName="faste.stl" model={model} collapsible />);
    expect(screen.queryByRole('button', { name: 'Visa modellen i 3D' })).toBeNull();
    // Siffrorna sparas på ordern och finns kvar även utan filen.
    expect(screen.getByText('27,5 cm³')).toBeInTheDocument();
  });

  it('visar ingenting för en order utan fil', () => {
    const { container } = render(<ModelPanel />);
    expect(container.firstChild).toBeNull();
  });
});

describe('DiscountField', () => {
  const noop = () => undefined;

  it('löser in koden som skrivits', async () => {
    const onApply = vi.fn();
    render(
      <DiscountField
        code=""
        discount={null}
        error=""
        checking={false}
        onApply={onApply}
        onClear={noop}
      />,
    );
    await userEvent.type(screen.getByLabelText('Rabattkod'), 'host20');
    await userEvent.click(screen.getByRole('button', { name: 'Lös in' }));
    expect(onApply).toHaveBeenCalledWith('host20');
  });

  it('håller knappen stängd för ett tomt fält', () => {
    render(
      <DiscountField
        code=""
        discount={null}
        error=""
        checking={false}
        onApply={noop}
        onClear={noop}
      />,
    );
    expect(screen.getByRole('button', { name: 'Lös in' })).toBeDisabled();
  });

  it('visar den inlösta koden och vad den gav', () => {
    render(
      <DiscountField
        code="HOST20"
        discount={{ code: 'HOST20', label: 'HOST20 · 20 %', amount: 100, freeShipping: false }}
        error=""
        checking={false}
        onApply={noop}
        onClear={noop}
      />,
    );
    expect(screen.getByText('HOST20')).toBeInTheDocument();
    expect(screen.getByText(/−100/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Rabattkod')).toBeNull();
  });

  it('nämner fri frakt när koden ger det', () => {
    render(
      <DiscountField
        code="FRIFRAKT"
        discount={{ code: 'FRIFRAKT', label: 'FRIFRAKT', amount: 0, freeShipping: true }}
        error=""
        checking={false}
        onApply={noop}
        onClear={noop}
      />,
    );
    expect(screen.getByText(/fri frakt/)).toBeInTheDocument();
  });

  it('visar felet för en kod som inte gäller', () => {
    render(
      <DiscountField
        code="FELKOD"
        discount={null}
        error="Vi hittar ingen rabattkod med det namnet."
        checking={false}
        onApply={noop}
        onClear={noop}
      />,
    );
    expect(screen.getByText('Vi hittar ingen rabattkod med det namnet.')).toBeInTheDocument();
  });

  it('tiger om fel innan någon kod prövats', () => {
    render(
      <DiscountField
        code=""
        discount={null}
        error="Något gammalt fel"
        checking={false}
        onApply={noop}
        onClear={noop}
      />,
    );
    expect(screen.queryByText('Något gammalt fel')).toBeNull();
  });

  it('tar bort en inlöst kod', async () => {
    const onClear = vi.fn();
    render(
      <DiscountField
        code="HOST20"
        discount={{ code: 'HOST20', label: 'HOST20', amount: 100, freeShipping: false }}
        error=""
        checking={false}
        onApply={noop}
        onClear={onClear}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ta bort' }));
    expect(onClear).toHaveBeenCalled();
  });
});

describe('ShippingPicker', () => {
  const options: ShippingOption[] = [
    {
      id: 'postombud',
      name: 'Postombud',
      description: 'Hämtas hos ombud.',
      fee: 59,
      freeOver: 599,
      days: '2–4 arbetsdagar',
    },
    {
      id: 'express',
      name: 'Express',
      description: 'Går först.',
      fee: 179,
      days: '1–2 arbetsdagar',
    },
  ];

  it('visar avgiften som gäller för den här varukorgen', () => {
    render(
      <ShippingPicker
        options={options}
        selected="postombud"
        subtotal={400}
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByText('59 kr')).toBeInTheDocument();
    expect(screen.getByText('179 kr')).toBeInTheDocument();
    expect(screen.getByText('199 kr kvar till fri frakt')).toBeInTheDocument();
  });

  it('skriver Fri när gränsen är passerad', () => {
    render(
      <ShippingPicker
        options={options}
        selected="postombud"
        subtotal={700}
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByText('Fri')).toBeInTheDocument();
    // Express har ingen gräns och kostar fortfarande.
    expect(screen.getByText('179 kr')).toBeInTheDocument();
  });

  it('gör allt fritt när koden ger fri frakt', () => {
    const { container } = render(
      <ShippingPicker
        options={options}
        selected="express"
        subtotal={200}
        freeShipping
        onSelect={() => undefined}
      />,
    );
    expect(container.querySelectorAll('.shipping-fee')).toHaveLength(2);
    expect(screen.getAllByText('Fri')).toHaveLength(2);
    expect(screen.queryByText(/kvar till fri frakt/)).toBeNull();
  });

  it('markerar det valda alternativet', () => {
    render(
      <ShippingPicker
        options={options}
        selected="express"
        subtotal={400}
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByRole('radio', { name: /Express/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Postombud/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('rapporterar valet', async () => {
    const onSelect = vi.fn();
    render(
      <ShippingPicker options={options} selected="postombud" subtotal={400} onSelect={onSelect} />,
    );
    await userEvent.click(screen.getByRole('radio', { name: /Express/ }));
    expect(onSelect).toHaveBeenCalledWith('express');
  });

  it('visar ingenting innan alternativen hämtats', () => {
    const { container } = render(
      <ShippingPicker options={[]} selected="" subtotal={0} onSelect={() => undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('QuoteSummary', () => {
  const quote = {
    materialCost: 48,
    machineCost: 62,
    setupFee: 95,
    postProcessingCost: 0,
    rushSurcharge: 0,
    volumeDiscount: 0,
    unitPrice: 110,
    total: 315,
    estimatedPrintHours: 2.5,
    estimatedDeliveryDays: 4,
    estimatedWeightGrams: 48,
  };

  it('visar total, styckpris och antal', () => {
    render(<QuoteSummary quote={quote} quantity={2} materialName="PLA" />);
    expect(screen.getByText('315 kr')).toBeInTheDocument();
    expect(screen.getByText(/2 st/)).toBeInTheDocument();
    expect(screen.getByText('Material (PLA)')).toBeInTheDocument();
  });

  it('döljer rader som är noll', () => {
    render(<QuoteSummary quote={quote} quantity={1} />);
    expect(screen.queryByText('Efterbearbetning')).toBeNull();
    expect(screen.queryByText('Expresstillägg')).toBeNull();
    expect(screen.queryByText('Volymrabatt')).toBeNull();
  });

  it('visar tilläggen när de finns', () => {
    render(
      <QuoteSummary
        quote={{ ...quote, postProcessingCost: 85, rushSurcharge: 120, volumeDiscount: 40 }}
        quantity={5}
      />,
    );
    expect(screen.getByText('Efterbearbetning')).toBeInTheDocument();
    expect(screen.getByText('Expresstillägg')).toBeInTheDocument();
    expect(screen.getByText('Volymrabatt')).toBeInTheDocument();
  });

  it('skriver materialraden utan namn innan katalogen hämtats', () => {
    render(<QuoteSummary quote={quote} quantity={1} />);
    expect(screen.getByText('Material')).toBeInTheDocument();
  });

  it('visar printtid, vikt och leverans', () => {
    render(<QuoteSummary quote={quote} quantity={1} />);
    expect(screen.getByText(/48 g/)).toBeInTheDocument();
    expect(screen.getByText(/4 arbetsdagar/)).toBeInTheDocument();
  });
});
