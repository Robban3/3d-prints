import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { CartProvider } from './lib/cart';
import './styles.css';
import './themes.css';
import { AppearanceProvider } from './lib/appearance';

const container = document.getElementById('root');
if (!container) throw new Error('Hittade inte #root');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <CartProvider>
        <AppearanceProvider><App /></AppearanceProvider>
      </CartProvider>
    </BrowserRouter>
  </StrictMode>,
);
