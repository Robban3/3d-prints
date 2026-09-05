import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ProductCard } from "../components/ProductCard";
import { fetchConfig, fetchProducts } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import type { Product } from "../types";

type SortId = "popular" | "price-asc" | "price-desc" | "name";

const sorters: Record<SortId, (a: Product, b: Product) => number> = {
  popular: (a, b) => b.rating * b.reviewCount - a.rating * a.reviewCount,
  "price-asc": (a, b) => a.price - b.price,
  "price-desc": (a, b) => b.price - a.price,
  name: (a, b) => a.name.localeCompare(b.name, "sv"),
};

const sortLabels: Array<{ id: SortId; label: string }> = [
  { id: "popular", label: "Populärast" },
  { id: "price-asc", label: "Lägsta pris" },
  { id: "price-desc", label: "Högsta pris" },
  { id: "name", label: "Namn A–Ö" },
];

export function ShopPage() {
  const [params, setParams] = useSearchParams();
  const category = params.get("kategori") ?? "alla";
  const [search, setSearch] = useState(params.get("sok") ?? "");
  const [sort, setSort] = useState<SortId>("popular");

  const config = useAsync(() => fetchConfig(), []);
  const { data, loading, error } = useAsync(
    () => fetchProducts({ category }),
    [category],
  );

  const visible = useMemo(() => {
    const term = search.toLowerCase().trim();
    const filtered = (data?.products ?? []).filter((product) =>
      term
        ? [product.name, product.tagline, product.description]
            .join(" ")
            .toLowerCase()
            .includes(term)
        : true,
    );
    return [...filtered].sort(sorters[sort]);
  }, [data, search, sort]);

  function selectCategory(id: string) {
    const next = new URLSearchParams(params);
    if (id === "alla") next.delete("kategori");
    else next.set("kategori", id);
    setParams(next, { replace: true });
  }

  const categories = config.data?.categories ?? [];
  const active = categories.find((entry) => entry.id === category);

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <h1>Produkter</h1>
          <p>
            {active
              ? active.description
              : "Allt vi designar och printar i egen verkstad, redo att skickas."}
          </p>
        </div>

        <div className="filter-bar">
          <div className="chip-row">
            <button
              type="button"
              className="chip"
              aria-pressed={category === "alla"}
              onClick={() => selectCategory("alla")}
            >
              Alla
            </button>
            {categories.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="chip"
                aria-pressed={category === entry.id}
                onClick={() => selectCategory(entry.id)}
              >
                {entry.name}
              </button>
            ))}
          </div>
          <div className="row" style={{ marginLeft: "auto" }}>
            <label className="field-label" htmlFor="sok">
              Sök
            </label>
            <input
              id="sok"
              className="input"
              type="search"
              placeholder="t.ex. kruka"
              value={search}
              style={{ width: 180 }}
              onChange={(event) => setSearch(event.target.value)}
            />
            <label className="field-label" htmlFor="sortering">
              Sortera
            </label>
            <select
              id="sortering"
              className="input"
              style={{ width: 170 }}
              value={sort}
              onChange={(event) => setSort(event.target.value as SortId)}
            >
              {sortLabels.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="notice notice-error">{error}</p>}

        {loading ? (
          <div className="product-grid">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <div className="skeleton" key={n} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="panel center">
            <h3>Inga träffar</h3>
            <p className="muted">
              Vi hittade ingenting på ”{search}”. Prova ett annat ord – eller
              låt oss printa det du letar efter.
            </p>
          </div>
        ) : (
          <>
            <p className="dim" style={{ fontSize: "0.88rem" }}>
              Visar {visible.length} produkter
            </p>
            <div className="product-grid">
              {visible.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
