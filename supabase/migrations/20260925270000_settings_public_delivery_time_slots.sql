-- Permitir lectura pública de delivery_time_slots y configuraciones de storefront para la tienda online
DROP POLICY IF EXISTS "settings_select_public_storefront" ON public.settings;

CREATE POLICY "settings_select_public_storefront"
  ON public.settings FOR SELECT
  TO anon, authenticated
  USING (
    key IN (
      'general_config',
      'delivery_time_slots',
      'hero_banners',
      'admin_tags',
      'store_status',
      'ticket_config',
      'delivery_radius_km',
      'shipping_cost_per_km',
      'base_shipping_cost',
      'free_shipping_min_amount'
    )
  );
