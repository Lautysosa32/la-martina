/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/useAuthStore';
import { AuthGuard } from './components/auth/AuthGuard';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Home } from './pages/Home';
import { Category } from './pages/Category';
import { Delivery } from './pages/Delivery';
import { ShoppingCalculator } from './pages/ShoppingCalculator';
import { Cart } from './pages/Cart';
import { Profile } from './pages/Profile';
import { About } from './pages/About';
import { FAQ } from './pages/FAQ';
import { Checkout } from './pages/Checkout';
import { Search } from './pages/Search';
import { Favorites } from './pages/Favorites';
import { AdminLayout } from './pages/Admin/AdminLayout';
import { Dashboard } from './pages/Admin/Dashboard';
import { Inventory } from './pages/Admin/Inventory';
import { AdminOrders } from './pages/Admin/Orders';
import { Analytics } from './pages/Admin/Analytics';
import { Customers } from './pages/Admin/Customers';
import { Employees } from './pages/Admin/Employees';
import { POS } from './pages/Admin/POS';
import { Billing } from './pages/Admin/Billing';
import { Settings } from './pages/Admin/Settings';
import { WhatsAppMessages } from './pages/Admin/WhatsAppMessages';
import { AdminLogin } from './pages/AdminLogin';

export default function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const isAuthInitialized = useAuthStore((state) => state.initialized);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Optionally, you can show a global loader here while `isAuthInitialized` is false,
  // but for now we just render the app so we don't break existing routing.

  return (
    <div className="flex flex-col min-h-screen">
      <Routes>
        {/* Rutas de la Tienda */}
        <Route path="/" element={<><Header /><main className="flex-grow pt-[64px]"><Home /></main><Footer /></>} />
        <Route path="/category/:id" element={<><Header /><main className="flex-grow pt-[64px]"><Category /></main><Footer /></>} />
        <Route path="/cart" element={<><Header /><main className="flex-grow pt-[64px]"><Cart /></main><Footer /></>} />
        <Route path="/profile" element={<><Header /><main className="flex-grow pt-[64px]"><Profile /></main><Footer /></>} />
        <Route path="/about" element={<><Header /><main className="flex-grow pt-[64px]"><About /></main><Footer /></>} />
        <Route path="/faq" element={<><Header /><main className="flex-grow pt-[64px]"><FAQ /></main><Footer /></>} />
        <Route path="/checkout" element={<><Header /><main className="flex-grow pt-[64px]"><Checkout /></main><Footer /></>} />
        <Route path="/search" element={<><Header /><main className="flex-grow pt-[64px]"><Search /></main><Footer /></>} />
        <Route path="/favorites" element={<><Header /><main className="flex-grow pt-[64px]"><Favorites /></main><Footer /></>} />
        <Route path="/delivery" element={<><Header /><main className="flex-grow pt-[64px]"><Delivery /></main><Footer /></>} />
        <Route path="/calculadora-compras" element={<><Header /><main className="flex-grow pt-[64px]"><ShoppingCalculator /></main><Footer /></>} />

        {/* Rutas Administrativas */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AuthGuard><AdminLayout /></AuthGuard>}>
          <Route index element={<AuthGuard requiredPermission="dashboard.view_operations"><Dashboard /></AuthGuard>} />
          <Route path="inventory" element={<AuthGuard requiredPermission="products.view"><Inventory /></AuthGuard>} />
          <Route path="orders" element={<AuthGuard requiredPermission="orders.view"><AdminOrders /></AuthGuard>} />
          <Route path="analytics" element={<AuthGuard requiredPermission="dashboard.view_financial"><Analytics /></AuthGuard>} />
          <Route path="customers" element={<AuthGuard requiredPermission="customers.view"><Customers /></AuthGuard>} />
          <Route path="employees" element={<AuthGuard requiredPermission="employees.view"><Employees /></AuthGuard>} />
          <Route path="pos" element={<AuthGuard requiredPermission="pos.access"><POS /></AuthGuard>} />
          <Route path="billing" element={<AuthGuard requiredPermission="billing.view"><Billing /></AuthGuard>} />
          <Route path="settings" element={<AuthGuard requiredPermission="settings.access"><Settings /></AuthGuard>} />
          <Route path="whatsapp" element={<AuthGuard requiredPermission="settings.access"><WhatsAppMessages /></AuthGuard>} />
        </Route>
      </Routes>
    </div>
  );
}
