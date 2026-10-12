import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { useCart } from '../lib/cart';
import { fetchConfig } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Icon } from './Icon';
import { Logo } from './Logo';

const links = [
  { to: '/material', label: 'Material' },
  { to: '/sa-funkar-det', label: 'Så funkar det' },
  { to: '/om-oss', label: 'Om oss' },
  { to: '/kontakt', label: 'Kontakt' },
];

export function Header() {
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const config = useAsync(() => fetchConfig(), []);
  const [shopOpen, setShopOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState('');
  const shopRef = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  // Menyn ska stängas när man klickar utanför den eller trycker Escape.
  useEffect(() => {
    if (!shopOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!shopRef.current?.contains(event.target as Node)) setShopOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setShopOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
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
          <div className="nav-group" ref={shopRef}>
            <button
              type="button"
              className="nav-trigger"
              aria-expanded={shopOpen}
              aria-haspopup="true"
              onClick={() => setShopOpen((open) => !open)}
            >
              Butik
              <Icon name="chevronDown" size={15} />
            </button>
            {shopOpen && (
              <div className="nav-menu">
                <Link to="/produkter" onClick={() => setShopOpen(false)}>
                  Alla produkter
                  <span>Hela sortimentet</span>
                </Link>
                {(config.data?.categories ?? []).map((category) => (
                  <Link
                    key={category.id}
                    to={`/produkter?kategori=${category.id}`}
                    onClick={() => setShopOpen(false)}
                  >
                    {category.name}
                    <span>{category.description}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <NavLink to="/egen-print" className={({ isActive }) => (isActive ? 'active' : '')}>Egen print</NavLink>
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
