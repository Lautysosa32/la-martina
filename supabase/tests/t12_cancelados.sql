-- T12 Test: Verificación de exclusión de pedidos cancelados
-- Este script se ejecuta en transacciones temporales con ROLLBACK, solo en local.

BEGIN;

-- 1. Insertamos un producto de prueba con ID texto
INSERT INTO public.products (id, name, price, stock, min_stock) 
VALUES ('prod-t12-test', 'Test T12 Product', 1000, 50, 10);

-- 2. Insertamos un pedido válido (Entregado) de la semana pasada con 50 uds.
INSERT INTO public.orders (id, branch_id, total, status, payment_method, method, created_at, customer, date)
VALUES ('00000000-0000-0000-0000-000000000001', 'main', 50000, 'Entregado', 'Efectivo', 'Retiro Local', now() - interval '10 days', 'Test Customer', to_char(now() - interval '10 days', 'YYYY-MM-DD'));

INSERT INTO public.order_items (order_id, product_id, name, quantity, price)
VALUES ('00000000-0000-0000-0000-000000000001', 'prod-t12-test', 'Test T12 Product', 50, 1000);

-- 3. Insertamos un pedido Cancelado de la misma semana con 100 uds.
INSERT INTO public.orders (id, branch_id, total, status, payment_method, method, created_at, customer, date)
VALUES ('00000000-0000-0000-0000-000000000002', 'main', 100000, 'Cancelado', 'Efectivo', 'Retiro Local', now() - interval '9 days', 'Test Customer', to_char(now() - interval '9 days', 'YYYY-MM-DD'));

INSERT INTO public.order_items (order_id, product_id, name, quantity, price)
VALUES ('00000000-0000-0000-0000-000000000002', 'prod-t12-test', 'Test T12 Product', 100, 1000);

-- 4. Ejecutamos la función. El resultado debe contener únicamente 50 unidades para 'prod-t12-test' (el pedido cancelado de 100 no cuenta).
SELECT jsonb_path_query(public.get_product_weekly_sales_stats(16), '$[*] ? (@.product_id == "prod-t12-test")') AS t12_result;

ROLLBACK;
