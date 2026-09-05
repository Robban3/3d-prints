import { Route, Routes } from 'react-router';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ScrollToTop } from './components/ScrollToTop';
import { HomePage } from './pages/HomePage';
import { ShopPage } from './pages/ShopPage';
import { ProductPage } from './pages/ProductPage';
import { CustomOrderPage } from './pages/CustomOrderPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { TrackOrderPage } from './pages/TrackOrderPage';
import { AboutPage } from './pages/AboutPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { MaterialPage } from './pages/MaterialPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { TopBar } from './components/TopBar';

export function App() {
  return (
    <>
      <ScrollToTop />
      <TopBar />
      <Header />
      <main id="innehall">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/produkter" element={<ShopPage />} />
          <Route path="/produkter/:slug" element={<ProductPage />} />
          <Route path="/egen-print" element={<CustomOrderPage />} />
          <Route path="/varukorg" element={<CartPage />} />
          <Route path="/kassa" element={<CheckoutPage />} />
          <Route path="/order/:id" element={<ConfirmationPage />} />
          <Route path="/spara-order" element={<TrackOrderPage />} />
          <Route path="/material" element={<MaterialPage />} />
          <Route path="/sa-funkar-det" element={<HowItWorksPage />} />
          <Route path="/om-oss" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
