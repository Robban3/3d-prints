import { Link } from 'react-router';
import { ProductArt } from './ProductArt';
import { Icon } from './Icon';
import type { ArtShape, ArtTone, Category } from '../types';

/**
 * Lyfter fram några kategorier på startsidan med en bild och en rad text.
 *
 * Namnen och beskrivningarna kommer från katalogen, inte härifrån, så en ändring
 * i panelen slår igenom direkt. Det enda som står här är vilka kategorier som
 * ska lyftas och vilken illustration var och en får.
 */
const featured: Array<{ id: string; shape: ArtShape; tone: ArtTone }> = [
  { id: 'julpynt-personligt', shape: 'nameOrnament', tone: 'benvit' },
  { id: 'jul-dekorationer', shape: 'christmasTree', tone: 'gran' },
  { id: 'julklappar', shape: 'giftBox', tone: 'vinrod' },
];

export function FeaturedCategories({
  categories,
  title,
}: {
  categories: Category[];
  title: string;
}) {
  const cards = featured
    .map((entry) => ({ ...entry, category: categories.find((item) => item.id === entry.id) }))
    .filter(
      (entry): entry is typeof entry & { category: Category } => entry.category !== undefined,
    );

  // Har kategorierna tagits bort i panelen ska sektionen inte stå tom.
  if (cards.length === 0) return null;

  const all = cards.map((entry) => entry.id).join(',');

  return (
    <section className="section">
      <div className="container">
        <div className="spread section-head">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <Link className="link-arrow" to={`/produkter?kategori=${all}`}>
            Visa hela kollektionen
            <Icon name="arrowRight" size={16} />
          </Link>
        </div>

        <div className="featured-categories">
          {cards.map((entry) => (
            <Link
              key={entry.id}
              className="featured-category"
              to={`/produkter?kategori=${entry.id}`}
            >
              <span className="featured-category-art">
                <ProductArt shape={entry.shape} tone={entry.tone} />
              </span>
              <span className="featured-category-body">
                <strong>{entry.category.name}</strong>
                <span>{entry.category.description}</span>
                <span className="link-arrow">
                  Se utbudet
                  <Icon name="arrowRight" size={15} />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
