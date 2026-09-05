import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ProductArt } from "../components/ProductArt";
import { ProductCard } from "../components/ProductCard";
import { Rating } from "../components/Rating";
import { fetchProduct } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { useCart } from "../lib/cart";
import { formatHours, formatPrice } from "../lib/format";

export function ProductPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { add } = useCart();
  const { data, loading, error } = useAsync(() => fetchProduct(slug), [slug]);

  const product = data?.product;
  const [color, setColor] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!product) return;
    setColor(product.colors[0] ?? "");
    setSizeId(product.sizes?.[0]?.id ?? "");
    setQuantity(1);
    setAdded(false);
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
        <p className="muted">
          {error ?? "Kontrollera länken eller bläddra i sortimentet."}
        </p>
        <Link className="btn" to="/produkter">
          Till produkterna
        </Link>
      </div>
    );
  }

  const size = product.sizes?.find((entry) => entry.id === sizeId);
  const unitPrice = product.price + (size?.priceDelta ?? 0);

  function addToCart(goToCart: boolean) {
    if (!product) return;
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
    });
    if (goToCart) navigate("/varukorg");
    else {
      setAdded(true);
      window.setTimeout(() => setAdded(false), 2500);
    }
  }

  return (
    <section className="section">
      <div className="container">
        <nav className="breadcrumbs" aria-label="Brödsmulor">
          <Link to="/">Start</Link> / <Link to="/produkter">Produkter</Link> /{" "}
          {product.name}
        </nav>

        <div className="product-layout">
          <div className="stack">
            <div className="product-hero-art">
              <ProductArt
                shape={product.art.shape}
                accent={product.art.accent}
                title={product.name}
              />
            </div>
            <div className="panel panel-tight">
              <h3>Specifikation</h3>
              <table className="spec-table">
                <tbody>
                  <tr>
                    <th>Material</th>
                    <td>{product.material.toUpperCase()}</td>
                  </tr>
                  <tr>
                    <th>Mått (B×D×H)</th>
                    <td>
                      {product.dimensions.width} × {product.dimensions.depth} ×{" "}
                      {product.dimensions.height} mm
                    </td>
                  </tr>
                  <tr>
                    <th>Vikt</th>
                    <td>{product.weightGrams} g</td>
                  </tr>
                  <tr>
                    <th>Printtid</th>
                    <td>{formatHours(product.printTimeHours)}</td>
                  </tr>
                  <tr>
                    <th>Lagerstatus</th>
                    <td>{product.stock} st i lager</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="stack" style={{ gap: 22 }}>
            <div>
              <div className="row">
                <span className="badge badge-accent">
                  {product.material.toUpperCase()}
                </span>
                <Rating value={product.rating} count={product.reviewCount} />
              </div>
              <h1 style={{ marginTop: 14 }}>{product.name}</h1>
              <p className="muted" style={{ fontSize: "1.05rem" }}>
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
                    <span className="field-label">Storlek</span>
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
                          <span>
                            {entry.priceDelta === 0
                              ? "Grundpris"
                              : `${entry.priceDelta > 0 ? "+" : ""}${formatPrice(entry.priceDelta)}`}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="spread">
                  <div>
                    <span className="field-label">Antal</span>
                    <div className="qty" style={{ marginTop: 8 }}>
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
                    <div className="price" style={{ fontSize: "1.6rem" }}>
                      {formatPrice(unitPrice * quantity)}
                    </div>
                  </div>
                </div>

                <div className="row">
                  <button
                    type="button"
                    className="btn btn-lg"
                    onClick={() => addToCart(false)}
                  >
                    Lägg i varukorg
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-lg"
                    onClick={() => addToCart(true)}
                  >
                    Köp nu
                  </button>
                </div>
                {added && (
                  <p className="notice notice-success">Tillagd i varukorgen.</p>
                )}
                <p className="dim" style={{ margin: 0, fontSize: "0.86rem" }}>
                  Printas på beställning i vår verkstad · Skickas inom 1–3
                  arbetsdagar · Fri frakt över 599 kr
                </p>
              </div>
            </div>

            <div className="panel panel-tight">
              <h3>Vill du ha den annorlunda?</h3>
              <p className="muted" style={{ marginBottom: 12 }}>
                Vi ändrar gärna mått, färg eller detaljer på våra egna modeller
                – eller printar din egen fil från grunden.
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
