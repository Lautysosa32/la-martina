import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { CartProvider } from './context/CartContext.tsx';
import { FavoritesProvider } from './context/FavoritesContext.tsx';
import { AdminProvider } from './context/AdminContext.tsx';

// Limpieza de claves administrativas obsoletas de localStorage
const cleanupLegacyKeys = () => {
  const legacyKeys = [
    'la-martina-admin-products', 'la-martina-admin-categories', 
    'la-martina-admin-tags', 'la-martina-admin-stock', 
    'la-martina-admin-orders', 'la-martina-admin-cashmovements', 
    'la-martina-admin-cash-closes', 'la-martina-admin-customer-profiles',
    'la-martina-admin-offers', 'la-martina-billing-customers',
    'la-martina-cash-register', 'la-martina-current-account-config',
    'la-martina-ticket-config', 'la-martina-admin-last-pos-close',
    'la-martina-catalog-version', 'la-martina-invoices'
  ];
  legacyKeys.forEach(key => localStorage.removeItem(key));
};
cleanupLegacyKeys();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AdminProvider>
          <CartProvider>
            <FavoritesProvider>
              <App />
            </FavoritesProvider>
          </CartProvider>
        </AdminProvider>
    </BrowserRouter>
  </StrictMode>,
);
