import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useCart } from '../lib/cart';
import { fetchConfig } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Icon, type IconName } from './Icon';
import { Logo } from './Logo';

const links = [
  { to: '/material', label: 'Material' },
  { to: '/sa-funkar-det', label: 'Så funkar det' },
  { to: '/om-oss', label: 'Om oss' },
  { to: '/kontakt', label: 'Kontakt' },
];

const categoryIcons: Record<string, IconName> = {
  inredning: 'home', kontor: 'desk', kok: 'kitchen', prylar: 'hobby',
  tillbehor: 'cube', julkollektionen: 'tree', halloween: 'pumpkin',
};
const seasonalIds = new Set(['julkollektionen', 'halloween']);

export function Header() {
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const menuId = useId();
  const config = useAsync(() => fetchConfig(), []);
  const [shopOpen, setShopOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState('');
  const shopRef = useRef<HTMLDivElement>(null);
  const shopTrigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const categories = config.data?.categories ?? [];
  const regularCategories = categories.filter((category) => !seasonalIds.has(category.id));
  const seasonalCategories = categories.filter((category) => seasonalIds.has(category.id));

  useEffect(() => { setShopOpen(false); }, [location.pathname, location.search]);

  // Menyn ska stängas när man klickar utanför den eller trycker Escape.
  useEffect(() => {
    if (!shopOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!shopRef.current?.contains(event.target as Node)) setShopOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShopOpen(false);
        shopTrigger.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [shopOpen]);

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const query = term.trim();
    navigate(query ? `/produkter?sok=${encodeURIComponent(query)}` : '/produkter');
    setSearchOpen(false);
    setTerm('');
  }

  return (
    <header className="site-header">
      <div className="container">
        <Link to="/" className="brand">
          <Logo />
        </Link>

        <nav className="nav" aria-label="Huvudmeny">
          <div className="nav-group" ref={shopRef} onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setShopOpen(false);
          }}>
            <button
              type="button"
              className="nav-trigger"
              ref={shopTrigger}
              aria-expanded={shopOpen}
              aria-controls={menuId}
              onClick={() => setShopOpen((open) => !open)}
            >
              Butik
              <Icon name="chevronDown" size={15} />
            </button>
            {shopOpen && (
              <div className="nav-menu" id={menuId}>
                <div className="nav-menu-list">
                  <Link className="nav-menu-all" to="/produkter" onClick={() => setShopOpen(false)}>
                    <Icon name="bag" size={24} />
                    <span>Alla produkter</span>
                    <Icon name="chevronRight" size={16} className="nav-menu-arrow" />
                  </Link>
                  {[regularCategories, seasonalCategories].map((group, index) => (
                    <div key={index} className={index === 1 && group.length ? 'nav-menu-seasonal' : undefined}>
                      {group.map((category) => (
                        <Link
                          key={category.id}
                          to={`/produkter?kategori=${category.id}`}
                          onClick={() => setShopOpen(false)}
                        >
                          <Icon name={categoryIcons[category.id] ?? 'grid'} size={24} />
                          <span>{category.name}</span>
                          <Icon name="chevronRight" size={16} className="nav-menu-arrow" />
                        </Link>
                      ))}
                    </div>
                  ))}
                  <Link to="/fyndhornan" onClick={() => setShopOpen(false)}><Icon name="bag" size={24} /><span>Fyndhörnan</span><Icon name="chevronRight" size={16} className="nav-menu-arrow" /></Link>
                </div>
              </div>
            )}
          </div>
          <NavLink to="/egen-print" className={({ isActive }) => (isActive ? 'active' : '')}>Egen print</NavLink>
          <NavLink to="/litofan" className={({ isActive }) => (isActive ? 'active' : '')}>Foto till 3D</NavLink>
          {links.filter((link) => link.to === '/om-oss').map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label="Sök bland produkterna"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <Icon name="search" />
          </button>
          <Link
            to="/varukorg"
            className="icon-btn"
            aria-label={`Varukorg med ${itemCount} artiklar`}
          >
            <Icon name="bag" size={24} />
            <span className="cart-badge">{itemCount}</span>
          </Link>
        </div>
      </div>

      {searchOpen && (
        <div className="header-search">
          <form className="container" onSubmit={submitSearch} role="search">
            <input
              ref={searchInput}
              className="input"
              type="search"
              placeholder="Sök efter produkt, t.ex. kruka eller kabelhållare"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
            />
            <button type="submit" className="btn">
              Sök
            </button>
          </form>
        </div>
      )}
    </header>
  );
}
