import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { CartProvider } from './context/CartContext.tsx';
import { FavoritesProvider } from './context/FavoritesContext.tsx';
import { AdminProvider } from './context/AdminContext.tsx';

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
