import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ScrollToTop } from './components/ScrollToTop';
const HomePage = lazy(() => import('./pages/HomePage').then(module => ({ default: module.HomePage })));
const ShopPage = lazy(() => import('./pages/ShopPage').then(module => ({ default: module.ShopPage })));
const ProductPage = lazy(() => import('./pages/ProductPage').then(module => ({ default: module.ProductPage })));
const CustomOrderPage = lazy(() => import('./pages/CustomOrderPage').then(module => ({ default: module.CustomOrderPage })));
const LithophanePage = lazy(() => import('./pages/LithophanePage').then(module => ({ default: module.LithophanePage })));
const CartPage = lazy(() => import('./pages/CartPage').then(module => ({ default: module.CartPage })));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage').then(module => ({ default: module.CheckoutPage })));
const ConfirmationPage = lazy(() => import('./pages/ConfirmationPage').then(module => ({ default: module.ConfirmationPage })));
const TrackOrderPage = lazy(() => import('./pages/TrackOrderPage').then(module => ({ default: module.TrackOrderPage })));
const AboutPage = lazy(() => import('./pages/AboutPage').then(module => ({ default: module.AboutPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then(module => ({ default: module.NotFoundPage })));
const MaterialPage = lazy(() => import('./pages/MaterialPage').then(module => ({ default: module.MaterialPage })));
const HowItWorksPage = lazy(() => import('./pages/HowItWorksPage').then(module => ({ default: module.HowItWorksPage })));
const ContactPage = lazy(() => import('./pages/ContactPage').then(module => ({ default: module.ContactPage })));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then(module => ({ default: module.PrivacyPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then(module => ({ default: module.AdminPage })));
import { TopBar } from './components/TopBar';
import { ThemePreviewBar } from './components/ThemePreviewBar';

export function App() {
  return (
    <>
      <ScrollToTop />
      <ThemePreviewBar />
      <TopBar />
      <Header />
      <main id="innehall">
        <Suspense fallback={<div className="container route-loading" role="status">Laddar sidan…</div>}><Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/produkter" element={<ShopPage />} />
          <Route path="/produkter/spiral-vas" element={<Navigate to="/produkter/vas-nexo" replace />} />
          <Route path="/produkter/:slug" element={<ProductPage />} />
          <Route path="/egen-print" element={<CustomOrderPage />} />
          <Route path="/litofan" element={<LithophanePage />} />
          <Route path="/varukorg" element={<CartPage />} />
          <Route path="/kassa" element={<CheckoutPage />} />
          <Route path="/order/:id" element={<ConfirmationPage />} />
          <Route path="/spara-order" element={<TrackOrderPage />} />
          <Route path="/material" element={<MaterialPage />} />
          <Route path="/sa-funkar-det" element={<HowItWorksPage />} />
          <Route path="/om-oss" element={<AboutPage />} />
          <Route path="/kontakt" element={<ContactPage />} />
          <Route path="/integritet" element={<PrivacyPage />} />
          <Route path="/verkstad" element={<AdminPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes></Suspense>
      </main>
      <Footer />
    </>
  );
}
