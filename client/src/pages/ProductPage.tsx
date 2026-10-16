import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router';
import { ProductImage } from '../components/ProductImage';
import { ProductCard } from '../components/ProductCard';
import { Rating } from '../components/Rating';
import { Icon } from '../components/Icon';
import { fetchProduct } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { useCart } from '../lib/cart';
import { formatHours, formatPrice } from '../lib/format';
import { selectedProductImage } from '../lib/productImage';
import { NameOrnamentPreview } from '../components/NameOrnamentPreview';
import { normalizeOrnamentName, ornamentNameError, ornamentGreetingError, ORNAMENT_NAME_MAX_LENGTH } from '../lib/ornamentName';
import { productPrice } from '../lib/productPrice';
import { ProductPrice } from '../components/ProductPrice';

export function ProductPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const { add } = useCart();
  const { data, loading, error } = useAsync(() => fetchProduct(slug), [slug]);

  const product = data?.product;
  const [color, setColor] = useState('');
  const [sizeId, setSizeId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [personalization, setPersonalization] = useState('');
  const [secondLine, setSecondLine] = useState('jul');
  const [nameTouched, setNameTouched] = useState(false);
  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 2500);
    return () => window.clearTimeout(timer);
  }, [added]);

  useEffect(() => {
    if (!product) return;
    setColor(product.colors[0] ?? '');
    setSizeId(product.sizes?.[0]?.id ?? '');
    setQuantity(1);
    setAdded(false);
    setPersonalization(product.slug === 'var-forsta-jul' ? 'Vår första' : '');
    setSecondLine('jul');
    setNameTouched(false);
  }, [product]);

  if (loading)
    return (
      <div className="container section">
        <div className="skeleton" style={{ height: 420 }} />
      </div>
    );
  if (error || !product) {
    return (
      <div className="container section center">
        <h1>Produkten finns inte</h1>
        <p className="muted">{error ?? 'Kontrollera länken eller bläddra i sortimentet.'}</p>
        <Link className="btn" to="/produkter">
          Till produkterna
        </Link>
      </div>
    );
  }

  const size = product.sizes?.find((entry) => entry.id === sizeId) ?? product.sizes?.[0];
  const unitPrice = productPrice(product, size?.priceDelta ?? 0).price;
  const image = selectedProductImage(product, color, sizeId);
  const dimensions = size?.dimensions ?? product.dimensions;
  const weightGrams = size?.weightGrams ?? product.weightGrams;
  const printTimeHours = size?.printTimeHours ?? product.printTimeHours;
  const greeting = product.slug === 'var-forsta-jul';
  const personalized = product.slug === 'namnornament' || greeting;
  const personalText = greeting ? `${normalizeOrnamentName(personalization)} / ${normalizeOrnamentName(secondLine)}` : normalizeOrnamentName(personalization);
  const nameError = personalized ? greeting ? ornamentGreetingError(personalText) : ornamentNameError(personalization) : null;

  function addToCart(goToCart: boolean) {
    if (!product) return;
    if (nameError) { setNameTouched(true); document.getElementById('ornament-name')?.focus(); return; }
    add({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      unitPrice,
      quantity,
      color,
      size: size?.id,
      sizeName: size?.name,
      art: product.art,
      image,
      ...(personalized ? { personalization: personalText } : {}),
    });
    if (goToCart) navigate('/varukorg');
    else {
      setAdded(true);
    }
  }

  return (
    <section className="section">
      <div className="container">
        <nav className="breadcrumbs" aria-label="Brödsmulor">
          <Link to="/">Start</Link> / <Link to="/produkter">Produkter</Link> / {product.name}
        </nav>

        <div className="product-layout">
          <div className="stack product-media">
            <div className="product-hero-art">
              <ProductImage product={{ ...product, image }} priority sizes="(max-width: 900px) 100vw, 50vw" />
            </div>
            {image?.fileName.endsWith('-visualisering.webp') && <p className="dim" style={{ fontSize: '.8rem', margin: 0 }}>Illustrativ produktbild. Dekoration och tillbehör ingår bara när det anges i beskrivningen.</p>}
            <div className="panel panel-tight product-specs">
              <h3>Specifikation</h3>
              <table className="spec-table">
                <tbody>
                  <tr>
                    <th>Material</th>
                    <td>
                      {product.material.toUpperCase()} {product.finish}
                    </td>
                  </tr>
                  <tr>
                    <th>Mått (B×D×H)</th>
                    <td>
                      {Object.values(dimensions).some(value => value <= 0) ? 'Fastställs inför produktion' : `${product.dimensionsEstimated ? 'Ca ' : ''}${dimensions.width} × ${dimensions.depth} × ${dimensions.height} mm`}
                    </td>
                  </tr>
                  <tr>
                    <th>Vikt</th>
                    <td>{weightGrams <= 0 ? 'Fastställs inför produktion' : `${product.productionEstimated ? 'Ca ' : ''}${weightGrams} g`}</td>
                  </tr>
                  <tr>
                    <th>Printtid</th>
                    <td>{printTimeHours <= 0 ? 'Fastställs inför produktion' : `${product.productionEstimated ? 'Ca ' : ''}${formatHours(printTimeHours)}`}</td>
                  </tr>
                  <tr>
                    <th>Lagerstatus</th>
                    <td>{product.stock} st i lager</td>
                  </tr>
                </tbody>
              </table>
              {product.dimensionsNote && <p className="field-hint">{product.dimensionsNote}</p>}
              {product.dimensionsEstimated && <p className="field-hint">Preliminära designmått – bekräftas vid provprintning.</p>}
              {product.productionEstimated && <p className="field-hint">Vikt och printtid är preliminära uppskattningar, inte uppmätta eller beräknade i skrivarprogrammet. {product.productionNote}</p>}
            </div>
          </div>

          <div className="stack product-details" style={{ gap: 22 }}>
            <div>
              <div className="row">
                <span className="badge badge-accent">
                  {product.material.toUpperCase()} {product.finish}
                </span>
                {product.reviewCount > 0 && <Rating value={product.rating} count={product.reviewCount} />}
              </div>
              <h1 className="product-title" style={{ marginTop: 14 }}>
                {product.name}
              </h1>
              <p className="muted" style={{ fontSize: '1.05rem' }}>
                {product.tagline}
              </p>
            </div>

            <p>{product.description}</p>

            <ul className="tick-list">
              {product.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>

            <div className="panel">
              <div className="stack" style={{ gap: 20 }}>
                {productPrice(product, size?.priceDelta ?? 0).sale && <div className="sale-detail"><span className="badge">Fyndhörnan · −{product.discountPercent} %</span><ProductPrice product={product} delta={size?.priceDelta ?? 0} /></div>}
                {personalized && (
                  <div className="ornament-name-field">
                    <label className="field-label" htmlFor="ornament-name">{greeting ? 'Text på övre raden' : 'Namn på ornamentet'}</label>
                    <input id="ornament-name" className="input" type="text" value={personalization}
                      maxLength={ORNAMENT_NAME_MAX_LENGTH} placeholder={greeting ? 'Vår första' : 'Till exempel Emma'}
                      autoComplete="off" spellCheck={false} required
                      aria-invalid={nameTouched && Boolean(nameError)}
                      aria-describedby={nameTouched && nameError ? 'ornament-name-error' : 'ornament-name-hint'}
                      onBlur={() => setNameTouched(true)}
                      onChange={event => { setPersonalization(event.target.value); setAdded(false); }} />
                    {greeting && <div style={{ marginTop: 12 }}><label className="field-label" htmlFor="ornament-second-line">Text på nedre raden</label>
                      <input id="ornament-second-line" className="input" type="text" value={secondLine} maxLength={ORNAMENT_NAME_MAX_LENGTH}
                        autoComplete="off" spellCheck={false} required placeholder="jul"
                        onBlur={() => setNameTouched(true)} onChange={event => { setSecondLine(event.target.value); setAdded(false); }} /></div>}
                    <p id="ornament-name-hint" className="field-hint">Förhandsvisningen uppdateras när du skriver. Högst {ORNAMENT_NAME_MAX_LENGTH} tecken{greeting ? ' per rad' : ''}.</p>
                    {nameTouched && nameError && <p id="ornament-name-error" className="field-error" role="alert">{nameError}</p>}
                    <NameOrnamentPreview name={personalization} secondLine={greeting ? secondLine : undefined} />
                  </div>
                )}
                <div>
                  <span className="field-label">Färg</span>
                  <div className="swatches" style={{ marginTop: 8 }}>
                    {product.colors.map((entry) => (
                      <button
                        key={entry}
                        type="button"
                        className="swatch"
                        aria-pressed={color === entry}
                        onClick={() => setColor(entry)}
                      >
                        {entry}
                      </button>
                    ))}
                  </div>
                </div>

                {product.sizes && product.sizes.length > 0 && (
                  <div>
                    <span className="field-label">{product.optionLabel || 'Storlek'}</span>
                    <div className="option-cards" style={{ marginTop: 8 }}>
                      {product.sizes.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          className="option-card"
                          aria-pressed={sizeId === entry.id}
                          onClick={() => setSizeId(entry.id)}
                        >
                          <strong>{entry.name}</strong>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="spread">
                  <div className="product-quantity-field">
                    <span className="field-label">Antal</span>
                    <div className="qty">
                      <button
                        type="button"
                        onClick={() => setQuantity((n) => Math.max(1, n - 1))}
                        aria-label="Minska antal"
                        disabled={quantity <= 1}
                      >
                        −
                      </button>
                      <span>{quantity}</span>
                      <button
                        type="button"
                        onClick={() => setQuantity((n) => Math.min(99, n + 1))}
                        aria-label="Öka antal"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="center">
                    <span className="field-label">Totalt</span>
                    <div className="price" style={{ fontSize: '1.6rem' }}>
                      {formatPrice(unitPrice * quantity)}
                    </div>
                  </div>
                </div>

                <div className="row">
                  <button type="button" className="btn btn-lg" disabled={product.stock <= 0} onClick={() => addToCart(false)}>
                    <Icon name="bag" size={20} />
                    Lägg i varukorg
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-lg"
                    onClick={() => addToCart(true)}
                    disabled={product.stock <= 0}
                  >
                    Köp nu
                  </button>
                </div>
                {added && <p className="notice notice-success">Tillagd i varukorgen.</p>}
                <p className="dim" style={{ margin: 0, fontSize: '0.86rem' }}>
                  Printas på beställning i vår verkstad · Skickas inom 1–3 arbetsdagar · Fri frakt
                  över 699 kr
                </p>
              </div>
            </div>

            <div className="panel panel-tight">
              <h3>Vill du ha den annorlunda?</h3>
              <p className="muted" style={{ marginBottom: 12 }}>
                Vi ändrar gärna mått, färg eller detaljer på våra egna modeller – eller printar din
                egen fil från grunden.
              </p>
              <Link className="btn btn-ghost" to="/egen-print">
                Beställ en egen variant
              </Link>
            </div>
          </div>
        </div>

        {data.related.length > 0 && (
          <div style={{ marginTop: 64 }}>
            <h2>Liknande produkter</h2>
            <div className="product-grid" style={{ marginTop: 22 }}>
              {data.related.map((entry) => (
                <ProductCard key={entry.id} product={entry} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
