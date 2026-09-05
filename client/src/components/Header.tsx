import { NavLink, Link } from "react-router-dom";
import { useCart } from "../lib/cart";
import { Logo } from "./Logo";

const links = [
  { to: "/produkter", label: "Produkter" },
  { to: "/egen-print", label: "Beställ egen print" },
  { to: "/spara-order", label: "Spåra order" },
  { to: "/om-oss", label: "Om oss" },
];

export function Header() {
  const { itemCount } = useCart();

  return (
    <header className="site-header">
      <div className="container">
        <Link to="/" className="brand">
          <Logo />
          Formlabb
        </Link>
        <nav className="nav" aria-label="Huvudmeny">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <Link
          to="/varukorg"
          className="cart-link"
          aria-label={`Varukorg med ${itemCount} artiklar`}
        >
          Varukorg
          {itemCount > 0 && <span className="cart-badge">{itemCount}</span>}
        </Link>
      </div>
    </header>
  );
}
