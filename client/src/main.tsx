import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { CartProvider } from './lib/cart';
import '@fontsource/lato/400.css';
import '@fontsource/lato/400-italic.css';
import '@fontsource/lato/700.css';
import '@fontsource/lato/900.css';
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
