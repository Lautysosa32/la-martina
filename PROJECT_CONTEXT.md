# PROJECT_CONTEXT: MARTINA SUPERMERCADO

> **Documento de Contexto Técnico y Funcional Integral**  
> Diseñado para ingesta en **NotebookLM** y comprensión técnica profunda por modelos de Inteligencia Artificial y desarrolladores.  
> Versión del Proyecto: 1.0.0 (Producción / Operación Activa)  
> Última actualización: Marzo 2026

---

## 1. DESCRIPCIÓN GENERAL

### Nombre del Proyecto
**Martina Supermercado** (también referenciado en el código como *Martina Supermercado*).

### Qué es
Es una plataforma web integral, modular y omnicanal orientada a la industria del supermercadismo minorista. Combina en una arquitectura unificada:
1. Una **Tienda Virtual (E-commerce / Storefront)** abierta al público consumidor para pedidos con entrega a domicilio (*delivery*) o retiro en tienda (*take away*).
2. Una **Calculadora de Compras en Tienda (In-Store Self-Checkout / Pre-compra)** orientada a clientes físicos que recorren el supermercado con su teléfono inteligente.
3. Un sistema de **Punto de Venta (POS - Point of Sale)** en mostrador de alta velocidad, multi-pestaña y adaptado a códigos de barras y balanzas de peso.
4. Un sistema de gestión empresarial interna (**ERP / Backoffice Administrativo**) para control de inventario, proveedores, cuenta corriente (fiados de clientes), arqueos y cierres de caja, auditoría de egresos operativos, facturación fiscal (tipos A, B y C) y analítica comercial en tiempo real.
5. Un **Worker Autónomo de WhatsApp** que automatiza notificaciones transaccionales a clientes y repartidores sin costo por mensaje.

### Para qué sirve
Sirve para digitalizar y coordinar el 100% de la operación diaria del supermercado, eliminando la brecha histórica entre el inventario físico de las góndolas y la tienda online, controlando el flujo financiero del efectivo en caja y optimizando la atención tanto presencial como remota.

### Qué problema resuelve
* **Desconexión entre mostrador y web:** Evita vender por la web mercadería que ya fue comprada en la caja física, gracias a transacciones atómicas con bloqueo pesimista en PostgreSQL.
* **Productos de peso variable (Carnicería, Fiambrería, Verdulería):** En un supermercado tradicional, el cliente pide 1 kg de carne, pero el corte pesado en balanza resulta ser de 1,080 kg. La plataforma permite presupuestar un estimado online y ajustar en mostrador/preparación el peso exacto de balanza, recalculando el importe total y notificando al cliente al instante.
* **Gestión de Fiados / Cuenta Corriente de cercanía:** En comercios barriales en Argentina, la venta a cuenta corriente es indispensable pero suele llevarse en cuadernos con alto riesgo de mora y descontrol. El sistema audita límites de crédito, días de mora acumulados y exige motivos de anulación o sobregiro.
* **Costos de mensajería:** Elimina la dependencia de las costosas APIs oficiales de Meta Cloud para WhatsApp, integrando un bot/worker local que procesa una cola de mensajes en segundo plano.
* **Fuga de dinero en caja:** Previene cobros en efectivo con cajas cerradas, audita retiros parciales de dinero, realiza cierres diarios con cálculo de sobrantes/faltantes y registra gastos operativos con impacto directo en caja chica.

### Público objetivo
1. **Clientes del Supermercado:** Vecinos de la zona de cobertura que compran online o que escanean productos en los pasillos para controlar su presupuesto antes de llegar a la caja.
2. **Cajeros y Personal de Mostrador:** Empleados que cobran con agilidad, usan pistolas lectoras de código de barras y emiten tickets térmicos.
3. **Armadores de Pedidos y Repartidores (Delivery):** Personal que recibe pedidos en tiempo real, pesa productos frescos y despacha compras georreferenciadas con mapas satelitales.
4. **Dueño y Administradores:** Gerencia que supervisa compras a proveedores, ventas netas, márgenes por categoría, lista de precios, fiados y caja diaria.

### Objetivo principal
Proporcionar un ecosistema comercial autónomo, veloz, seguro y sin costos recurrentes abusivos, diseñado a la medida de la idiosincrasia del supermercadismo argentino independiente.

---

## 2. FUNCIONALIDADES DETALLADAS

### 2.1. Storefront y Catálogo Online (Clientes)
* **Qué hace:** Muestra el catálogo de productos organizado jerárquicamente en Categorías (Almacén, Bebidas, Lácteos, Carnes, Limpieza, Perfumería, etc.) y Subcategorías, con badges de oferta, cálculo de descuentos y filtros avanzados.
* **Cómo funciona:** La vista principal consume proyecciones de columnas estrictas mediante Supabase REST (`productsService`) y un caché en memoria con expiración por TTL (`catalogCache.ts`) para minimizar el tráfico de red (*Egress*).
* **Quién puede usarla:** Usuarios anónimos (invitados) y clientes registrados.
* **Información que utiliza:** Tablas `products`, `categories`, `subcategories`, `offers`, `settings` (`hero_banners`, `store_status`).
* **Comportamiento interno:** Evalúa si la tienda online está pausada mediante `settings.store_status`. Si está pausada, informa el motivo y bloquea el botón de compra, permitiendo o denegando la navegación según la configuración del dueño.

### 2.2. Club Martina Supermercado: Precios Diferenciales y Beneficios
* **Qué hace:** Aplica una estrategia de precios segmentada: los clientes no registrados ven el precio regular de góndola y un cartel con el "Ahorro Potencial" que obtendrían al registrarse; los clientes autenticados acceden automáticamente a precios exclusivos de miembro (*Club Martina Supermercado*) y promociones especiales (3x2, descuentos porcentuales, precios fijos).
* **Cómo funciona:** El motor de cálculo en `CartContext.tsx` y `AdminContext.tsx` evalúa las reglas de la tabla `offers`. Si el usuario está autenticado, la bonificación se aplica directamente al total del carrito; si es invitado, el descuento se totaliza en la variable `potentialDiscount` como incentivo de registro.
* **Quién puede usarla:** Público general (display) / Clientes registrados (beneficio activo).
* **Información que utiliza:** Tablas `offers`, `offer_redemptions`, `customer_profiles`, `products`.

### 2.3. Calculadora de Compras en Tienda (In-Store Self-Checkout)
* **Qué hace:** Permite que un cliente que está físicamente dentro del supermercado use la cámara de su celular para escanear los códigos de barra de los productos que mete a su carrito físico, o ingrese artículos manualmente si no tienen código legible.
* **Cómo funciona:** La interfaz `ShoppingCalculator.tsx` invoca el componente modal `BarcodeScannerModal` con la biblioteca `@yudiel/react-qr-scanner` para decodificar códigos EAN-13/EAN-8. Al terminar, el cliente pulsa "Finalizar Pre-compra", ingresa su nombre y celular, y el sistema genera una sesión con un código alfanumérico único de 4 caracteres (ej: `AB34`).
* **Quién puede usarla:** Cualquier cliente físico en el local.
* **Información que utiliza:** Tablas `shopping_sessions`, `shopping_session_items`, `products`.
* **Comportamiento interno:** Almacena la sesión en Supabase para que el cajero en el POS pueda importar instantáneamente todos los productos sin necesidad de escanearlos uno por uno en la caja.

### 2.4. Punto de Venta Físico (POS Multi-Pestaña)
* **Qué hace:** Terminal de facturación y cobro en mostrador diseñada para teclado, pantalla táctil y lector láser de código de barras.
* **Características clave:**
  * **Multi-pestaña:** Permite mantener hasta 10 carritos en espera simultánea para no trabar la fila si un cliente va a buscar otro producto.
  * **Búsqueda fonética y por prefijo:** Algoritmo ponderado que busca en milisegundos por código exacto, prefijo, nombre y marca.
  * **Lectura de códigos de balanza:** Decodifica códigos de balanza que contienen el identificador del producto y su peso/importe embebido (`parseScaleBarcode.ts`).
  * **Modal de ajuste de peso:** Permite ingresar manualmente gramos o kilos para artículos fraccionables (`WeightInputModal.tsx`).
  * **Métodos de cobro:** Efectivo, Tarjeta (débito/crédito), Transferencia bancaria y Cuenta Corriente (Fiado).
  * **Descuentos globales y manuales:** Modificación controlada del precio o aplicación de descuentos del 0 al 100%.
* **Quién puede usarla:** Empleados con permisos `pos.access` y `pos.sell`.
* **Información que utiliza:** Tablas `products`, `orders`, `order_items`, `cash_movements`, `settings` (`cash_register`), `customers`.
* **Comportamiento interno:** Ejecuta el procedimiento almacenado transaccional `process_pos_sale(p_sale jsonb)` en PostgreSQL. La base de datos valida que la caja esté abierta si el cobro es en efectivo, descuenta el stock de inmediato con `FOR UPDATE`, inserta la orden con estado 'Entregado' e inserta el movimiento de caja.

### 2.5. Impresión de Tickets y Envío Digital por WhatsApp
* **Qué hace:** Al concretar una venta presencial, permite imprimir el ticket térmico (58mm u 80mm) con tipografía optimizada ESC/POS o enviarlo al WhatsApp del cliente con formato de texto enriquecido (negritas, listas alineadas y montos).
* **Cómo funciona:** `TicketPrinter.tsx` maneja el estilo CSS `@media print` para impresoras térmicas. A su vez, `generateTicketWhatsAppText` construye el mensaje y `whatsappMessageService` lo encola para envío automático.
* **Quién puede usarla:** Operadores de POS.

### 2.6. Checkout Web con Georreferenciación y Tarificación de Envíos
* **Qué hace:** Flujo final de compra online. El cliente selecciona "Retiro en local" o "Envío a domicilio".
* **Cómo funciona en Envíos:**
  * Abre el componente `MapSelector.tsx` sobre un mapa Leaflet centrado en el supermercado.
  * El cliente marca el pin en su vivienda. El sistema extrae latitud, longitud y geocodifica la calle, requiriendo altura numérica, entrecalles y notas de entrega.
  * Calcula la distancia en línea recta mediante la fórmula de Haversine (`calculateDistanceKm`).
  * Valida que esté dentro del radio operativo (`generalConfig.deliveryRadiusKm`).
  * Aplica la fórmula de envío: `shippingBaseCost + (kmExcedente * shippingCostPerKm)`. Si el subtotal de compra supera `freeShippingMinAmount`, el envío es gratis.
* **Quién puede usarla:** Clientes públicos en `/checkout`.
* **Comportamiento interno:** Envía el pedido al procedimiento transaccional `process_web_order(p_order jsonb)`, que descuenta stock en servidor y genera la orden en estado 'Pendiente'.

### 2.7. Verificación Telefónica OTP vía WhatsApp
* **Qué hace:** Previene pedidos fraudulentos o números telefónicos inexistentes durante el checkout web.
* **Cómo funciona:** Si el número de celular del cliente no está registrado como "dispositivo de confianza" en `localStorage` (`la_martina_verified_phones`), el sistema genera un código OTP de 4 dígitos y encola un mensaje de WhatsApp (`createOtpMessage`). El cliente debe tipear el PIN recibido en la pantalla para poder confirmar el pedido.
* **Quién puede usarla:** Clientes en proceso de checkout.

### 2.8. Gestión de Pedidos Online y Ajuste por Balanza Real
* **Qué hace:** Tablero administrativo de pedidos (`/admin/orders`) para preparar y despachar compras web.
* **Flujo de estados:** `Nuevo` ➔ `Preparando` ➔ `Listo` ➔ `En Camino` ➔ `Entregado` (o `Cancelado`).
* **Ajuste por Balanza:** En productos de carnicería o verdulería, el armador pulsa "Pesar Productos", introduce los kilogramos reales pesados en la balanza y el sistema actualiza el precio del ítem y el total de la orden.
* **Notificación al Cliente:** En cada cambio de estado, el sistema encola automáticamente un WhatsApp al cliente con plantillas personalizadas y amigables. Si hubo ajuste de peso, le detalla: *"Tus productos fueron pesados en balanza. Total final: $X (estimado inicial: $Y)"*.

### 2.9. Asignación Diaria de Repartidores
* **Qué hace:** Designa al empleado que cumplirá la función de repartidor en la jornada actual (`daily_delivery_assignments`).
* **Cómo funciona:** Cuando ingresa un nuevo pedido web para envío a domicilio, el sistema dispara automáticamente un mensaje de WhatsApp al repartidor de turno con el ID del pedido, nombre del cliente, cantidad de bultos, monto a cobrar y enlace a la dirección. Si el pedido se cancela, le envía una alerta urgente: *"NO armar ni entregar este pedido"*.

### 2.10. Cuenta Corriente (Fiados / Crédito Vecinal)
* **Qué hace:** Registra compras sin pago inmediato para clientes de confianza, llevando el saldo deudor histórico y auditoría de pagos.
* **Reglas:**
  * Validación de cupo de crédito (`maxDebtAmount`) y días máximos de deuda (`maxDebtDays`).
  * Soporte para excepciones manuales (`was_limit_override`) donde el cajero debe registrar el motivo del sobregiro.
  * Registro de cobros de deuda totales o parciales (`settleCurrentAccount`), emitiendo recibo y generando el ingreso correspondiente en la caja registradora.

### 2.11. Arqueo, Control de Caja y Retiros de Efectivo
* **Qué hace:** Supervisión exhaustiva del dinero en efectivo en la tienda.
* **Flujo:**
  * **Apertura:** Se registra el fondo de cambio inicial (`initialAmount`), la fecha y el empleado responsable.
  * **Operación:** Se registran movimientos automáticos (ventas en efectivo) y manuales (retiros parciales para seguridad, pagos chicos, ingresos varios).
  * **Cierre de Caja:** Al terminar el turno o día, calcula el total esperado desglosado por efectivo, tarjeta, transferencia y fiados.
  * **Control de Apertura del Día Siguiente:** Permite comparar el dinero que quedó guardado con el dinero efectivamente contado por el cajero entrante, calculando sobrantes o faltantes con notas obligatorias.

### 2.12. Control de Egresos Operativos (Expenses)
* **Qué hace:** Módulo para asentar todos los gastos del negocio divididos en 10 categorías: Mercadería, Proveedores, Sueldos, Alquiler, Impuestos, Retiro de Socios, Combustible, Mantenimiento, Administrativo y Otros.
* **Integración con Caja:** Si el egreso se abona en efectivo (`cash`), se deduce en tiempo real del saldo de la caja chica del local.

### 2.13. Facturación Fiscal (Billing)
* **Qué hace:** Registro de comprobantes fiscales de venta y de compra, compatibles con la estructura impositiva argentina (Facturas A, B y C con alícuotas del 21%, 10.5% y 0%).
* **Facturación Consolidada:** Permite tomar decenas de tickets de venta rápida del POS que no fueron facturados individualmente y agruparlos en una única Factura B global a Consumidor Final.

### 2.14. Worker Autónomo de WhatsApp (whatsapp-worker)
* **Qué hace:** Demonio en Node.js que corre de forma continua en la PC del supermercado conectada a WhatsApp Web mediante `whatsapp-web.js`.
* **Cómo funciona:** Revisa la tabla `whatsapp_messages` cada 10 segundos buscando registros con estado `pending`. Envía los mensajes utilizando la sesión local de WhatsApp y actualiza el estado en Supabase a `sent` (con timestamp) o `failed` (registrando el error y permitiendo hasta 3 reintentos).

---

## 3. ROLES Y PERMISOS (RBAC)

La plataforma cuenta con un sistema híbrido de control de acceso basado en roles (**RBAC - Role-Based Access Control**) con capacidad de sobreescritura granular (**Permissions Override**):

### Jerarquía de Roles
1. **`super_admin`:** Acceso irrestricto a todas las funciones, sucursales y configuraciones del sistema.
2. **`owner` (Dueño):** Acceso total a la sucursal asignada. Visualización de métricas financieras, balance de caja, rentabilidad, creación de empleados y administración de roles.
3. **`admin` (Encargado General):** Operación comercial y de depósito. Puede gestionar productos, stock, precios, pedidos, clientes, caja registradora y ofertas. **Restricción:** No puede ver datos financieros profundos ni crear otros administradores o dueños.
4. **`employee` (Empleado / Personal de mostrador):** Permisos mínimos por defecto. Sus facultades se determinan mediante presets o permisos individuales.
5. **`Cliente Registrado`:** Usuario de la tienda web con cuenta vinculada a su número telefónico.
6. **`Invitado (Guest)`:** Visitante anónimo de la tienda online.

### Matriz de Permisos Específicos (`PermissionKey`)
* **Productos:** `products.view`, `products.create`, `products.update`, `products.delete`, `products.change_price`, `products.change_stock`
* **Pedidos:** `orders.view`, `orders.update_status`, `orders.cancel`, `orders.view_revenue`
* **POS:** `pos.access`, `pos.sell`, `pos.apply_discount`
* **Caja:** `cash.view`, `cash.open`, `cash.close`, `cash.withdraw`, `cash.view_reports`
* **Clientes:** `customers.view`, `customers.create`, `customers.update`, `customers.delete`
* **Dashboard / Métricas:** `dashboard.view_operations`, `dashboard.view_financial`
* **Configuración:** `settings.access`
* **Empleados:** `employees.view`, `employees.create`, `employees.update`, `employees.delete`, `employees.manage_permissions`
* **Facturación:** `billing.view`, `billing.create`, `billing.cancel`
* **Ofertas:** `offers.view`, `offers.create`, `offers.update`, `offers.delete`
* **Egresos:** `expenses.view`, `expenses.create`, `expenses.update`, `expenses.delete`

### Presets de Empleados
* **Encargado:** Acceso a stock, precios, pedidos, ventas en POS, caja completa, clientes y ofertas.
* **Cajero:** Acceso a POS, cobros, caja diaria y pedidos.
* **Repositor / Delivery:** Acceso a stock, recepción de mercadería y cambio de estado de pedidos.

---

## 4. FLUJOS DE USO PRINCIPALES

### Flujo 1: Compra Online por el Cliente (E-Commerce)
```
1. Cliente ingresa a la tienda (Home o Categoría).
2. Explora productos (precios miembro destacados si inicia sesión, o potencial ahorro).
3. Agrega productos al carrito -> CartContext valida stock disponible.
4. Va a /checkout:
   a. Selecciona "Envío a domicilio" o "Retiro en tienda".
   b. Si es envío, abre mapa Leaflet, ubica su casa, ingresa numeración y referencias.
   c. El sistema calcula la distancia al supermercado y suma el costo de envío.
   d. Si el teléfono no está verificado en este dispositivo, recibe un OTP de 4 dígitos en WhatsApp y lo valida.
   e. Selecciona método de pago (Efectivo, Transferencia, Tarjeta, Cuenta Corriente).
5. Confirma pedido:
   - Se ejecuta el RPC `process_web_order` en PostgreSQL.
   - La base de datos bloquea ítems con FOR UPDATE, descuenta stock y crea la orden.
   - El carrito local se vacía.
   - Se encola mensaje en `whatsapp_messages` para avisar al repartidor asignado.
   - El cliente ve la confirmación y su pedido aparece en /profile.
```

### Flujo 2: Compra Presencial Asistida por Teléfono (Calculadora In-Store)
```
1. Cliente entra al supermercado físico y entra a /calculadora-compras.
2. Abre la cámara y escanea códigos de barra de los artículos que coloca en su carrito físico.
3. Observa el subtotal acumulado en tiempo real.
4. Presiona "Finalizar Pre-compra", ingresa su nombre y celular.
5. El sistema guarda la sesión en `shopping_sessions` y le entrega un código (ej. "LK82").
6. En la caja, el cajero abre el POS, pulsa "Importar Pre-compra", ingresa el código y todos los productos se cargan al instante en la terminal.
```

### Flujo 3: Venta Presencial en Caja (Punto de Venta POS)
```
1. Cajero abre la caja registradora al inicio del turno indicando el fondo inicial en efectivo.
2. Ingresa a /admin/pos.
3. Pasa los productos por el lector de código de barras físico o teclea búsquedas.
4. Si un producto es pesado (carnicería/verdulería), se abre el modal de balanza e ingresa los gramos/kilos.
5. Si el cliente solicita fiado (Cuenta Corriente), el sistema valida el DNI/teléfono, verifica que no tenga deuda vencida ni supere el límite de crédito.
6. Cobra la venta:
   - Ejecuta `process_pos_sale` en PostgreSQL.
   - La base de datos descuenta stock, crea la orden como 'Entregado' y registra el ingreso en `cash_movements`.
7. Opciones de comprobante:
   - Imprime ticket térmico en impresora de 58/80 mm.
   - O envía el ticket detallado en mensaje de WhatsApp al número del cliente.
```

### Flujo 4: Preparación, Pesaje y Entrega de Pedidos Online
```
1. Entra un pedido online con estado "Nuevo".
2. El armador lo pasa a estado "Preparando" -> WhatsApp al cliente: "¡Ya estamos preparando tu pedido!".
3. El armador pesa los productos frescos en balanza real y pulsa "Pesar Productos", ajustando el gramaje exacto.
4. Pasa el pedido a "Listo" o "En Camino":
   - WhatsApp al cliente con el total ajustado por balanza.
   - WhatsApp al repartidor de turno con la dirección y ubicación GPS.
5. El repartidor entrega el pedido y el estado cambia a "Entregado" -> WhatsApp de agradecimiento al cliente.
```

---

## 5. ARQUITECTURA DEL SISTEMA

```
+-----------------------------------------------------------------------------------+
|                                 CLIENTES (Browsers)                               |
|   +---------------------------------------+   +-------------------------------+   |
|   |         Storefront / Clientes         |   |    Panel Admin / POS / ERP    |   |
|   |    React 19 + Vite 6 + Tailwind v4    |   | React 19 + Zustand + Leaflet  |   |
|   +---------------------------------------+   +-------------------------------+   |
+------------------------------------------+----------------------------------------+
                                           |
                    HTTPS / REST API / WebSockets (Realtime)
                                           |
+------------------------------------------v----------------------------------------+
|                            SUPABASE (BaaS / Backend)                              |
|                                                                                   |
|  +---------------------+  +----------------------+  +--------------------------+  |
|  |    Supabase Auth    |  | Edge Functions (Deno)|  |  PostgreSQL 15+          |  |
|  |  - Email / Password |  | - create-employee    |  |  - 28 Tablas             |  |
|  |  - Synthetic Phone  |  +----------------------+  |  - Row Level Security    |  |
|  +---------------------+                            |  - Stored Procedures RPC |  |
|                                                     |    * process_pos_sale    |  |
|                                                     |    * process_web_order   |  |
|                                                     +--------------------------+  |
+------------------------------------------+----------------------------------------+
                                           |
                         Polling de cola cada 10s (REST)
                                           |
+------------------------------------------v----------------------------------------+
|                   LOCAL STORE WORKER (Node.js en PC de Caja)                      |
|                                                                                   |
|   whatsapp-worker/worker.js                                                       |
|   - Utiliza whatsapp-web.js (Puppeteer headless)                                  |
|   - Conectado a la sesión de WhatsApp del Supermercado                            |
|   - Consume tabla `whatsapp_messages` -> Envia mensaje -> Marca `sent`/`failed`   |
+-----------------------------------------------------------------------------------+
```

### Comunicación entre componentes
* **Frontend ➔ Supabase:** Utiliza el SDK `@supabase/supabase-js` para operaciones directas, autenticación y subscripciones Realtime (PostgreSQL Changes). Adicionalmente, utiliza una instancia de `Axios` con interceptor JWT (`src/lib/axios.ts`) contra el endpoint `/rest/v1` de PostgREST para consultas paginadas y de catálogo altamente optimizadas.
* **Frontend ➔ Edge Functions:** Invoca la función `create-employee` para aprovisionar empleados en Supabase Auth y en la tabla `employees` sin exponer la clave `service_role` en el cliente.
* **Supabase ➔ WhatsApp Worker:** La base de datos actúa como una cola persistente de mensajes (*Message Queue*). El worker local consulta mensajes pendientes mediante select condicional y actualiza el estado.

---

## 6. TECNOLOGÍAS Y LIBRERÍAS UTILIZADAS

| Tecnología / Librería | Versión | Propósito en el Proyecto |
| :--- | :--- | :--- |
| **React** | 19.0.1 | Biblioteca base de interfaz de usuario reactiva. |
| **Vite** | 6.2.3 | Herramienta de compilación y servidor de desarrollo ultra-rápido. |
| **TypeScript** | 5.8.2 | Tipado estricto en toda la base de código. |
| **Tailwind CSS** | 4.1.14 | Motor de estilos utilitarios modernos con diseño responsivo. |
| **Zustand** | 5.0.13 | Gestión de estado global ligera para autenticación (`useAuthStore`), productos (`useProductStore`), notificaciones y calculadora de compras. |
| **React Router DOM** | 7.15.0 | Enrutador declarativo para la tienda y el panel de administración. |
| **Supabase JS** | 2.106.1 | Cliente oficial para interactuar con la base de datos, autenticación y realtime. |
| **PostgreSQL** | 15+ | Motor de base de datos relacional con RLS y procedimientos transaccionales. |
| **Axios** | 1.16.1 | Cliente HTTP configurado con interceptores JWT para consultas a PostgREST. |
| **Leaflet & @types/leaflet** | 1.9.4 | Mapas interactivos para geolocalización de domicilios de entrega. |
| **@yudiel/react-qr-scanner** | 2.6.0 | Lector de códigos de barra y QR mediante la cámara web/celular. |
| **whatsapp-web.js** | 1.34.x | Conector de WhatsApp Web en el worker de Node.js local. |
| **PapaParse & XLSX** | 5.5.3 / 0.18.5 | Procesamiento, importación y exportación de listas de precios en CSV y Excel. |
| **Lucide React** | 0.546.0 | Iconografía vectorial complementaria a Google Material Symbols. |

---

## 7. ESTRUCTURA DEL PROYECTO

```
c:\Users\lauty\Programacion\Martina Supermercado
├── esqueleto_lamartina.sql          # Dump completo del esquema DDL y funciones SQL
├── package.json                     # Dependencias y scripts del frontend
├── vite.config.ts                   # Configuración del empaquetador Vite
├── docs/
│   └── CLOUDFLARE_SECURITY.md      # Guía de WAF, SSL, Rate Limiting y defensas
├── supabase/
│   ├── config.toml                  # Configuración del CLI de Supabase
│   ├── functions/
│   │   └── create-employee/         # Edge Function en Deno para creación segura de personal
│   └── migrations/
│       └── 20260902000001_security_hardening_rls.sql # Hardening completo de RLS y transacciones
├── whatsapp-worker/
│   ├── worker.js                    # Demonio Node.js que lee whatsapp_messages y envía chats
│   ├── README.md                    # Documentación de instalación y escaneo de QR
│   ├── package.json                 # Dependencias del worker
│   └── silencioso.vbs               # Script para iniciar en segundo plano en Windows
└── src/
    ├── App.tsx                      # Declaración central de rutas protegidas y públicas
    ├── main.tsx                     # Punto de entrada de React con Providers
    ├── index.css                    # Tokens de diseño Tailwind v4 y estilos base
    ├── lib/
    │   ├── supabase.ts              # Inicialización de cliente Supabase con persistencia
    │   └── axios.ts                 # Cliente Axios con inyección de JWT para PostgREST
    ├── config/
    │   └── permissions.ts           # Definición de permisos por rol y presets de empleados
    ├── types/
    │   ├── permissions.types.ts     # Tipos de roles (super_admin, owner, admin, employee)
    │   ├── product.types.ts         # Modelo de datos de productos y proyecciones
    │   ├── expense.types.ts         # Tipos y categorías de egresos operativos
    │   └── shopping-session.types.ts# Tipos para pre-compras en tienda
    ├── stores/
    │   ├── useAuthStore.ts          # Store central de autenticación, sesión y perfiles
    │   ├── useProductStore.ts       # Store de productos y catálogos
    │   ├── useNotificationStore.ts  # Notificaciones toast del sistema
    │   └── useShoppingCalculatorStore.ts # Estado de la calculadora in-store
    ├── context/
    │   ├── AdminContext.tsx         # Cerebro del ERP/POS: caja, clientes, compras, facturación
    │   ├── CartContext.tsx          # Lógica del carrito, stock y cálculo de precios miembro
    │   └── FavoritesContext.tsx     # Productos favoritos del cliente
    ├── services/
    │   ├── admin.service.ts         # Consultas de administración (órdenes, movimientos, cierres)
    │   ├── products.service.ts      # Consultas paginadas de productos y proyecciones
    │   ├── customers.service.ts     # Perfiles de clientes y cuentas corrientes
    │   ├── employees.service.ts     # Gestión de empleados y permisos efectivos
    │   ├── expense.service.ts       # Operaciones de gastos y egresos
    │   ├── shopping-session.service.ts # Creación y rescate de sesiones de compra
    │   ├── whatsapp-message.service.ts # Encolado de mensajes de WhatsApp y OTP
    │   └── catalogCache.ts          # Caché en memoria con TTL para optimizar Egress
    ├── components/
    │   ├── Header.tsx / Footer.tsx  # Navegación superior y pie de página institucional
    │   ├── BarcodeScannerModal.tsx  # Lector de códigos de barra por cámara
    │   ├── MapSelector.tsx          # Selector de ubicación con mapa Leaflet y radio
    │   ├── TicketPrinter.tsx        # Impresión de tickets térmicos formateados
    │   ├── WeightInputModal.tsx     # Modal de pesaje para productos fraccionables
    │   ├── AdminNotificationCenter.tsx # Campana de alertas administrativas
    │   └── auth/AuthGuard.tsx       # Middleware de protección de rutas por permiso
    └── pages/
        ├── Home.tsx                 # Portada de la tienda virtual con carruseles
        ├── Category.tsx             # Catálogo filtrable por categorías y marcas
        ├── Cart.tsx                 # Resumen del carrito de compras
        ├── Checkout.tsx             # Pantalla de pago, geolocalización y confirmación OTP
        ├── Profile.tsx              # Perfil de cliente, direcciones y pedidos pasados
        ├── ShoppingCalculator.tsx   # Calculadora de compras en góndola
        ├── AdminLogin.tsx           # Ingreso exclusivo para personal administrativo
        └── Admin/
            ├── Dashboard.tsx        # Resumen operativo de la tienda
            ├── POS.tsx              # Punto de Venta en mostrador multi-pestaña
            ├── Orders.tsx           # Gestión de pedidos online y asignación de delivery
            ├── Inventory.tsx        # ABM de productos, precios masivos y stock
            ├── Analytics.tsx        # Métricas de ventas, ofertas y arqueo financiero
            ├── Customers.tsx        # Padrón de clientes y saldo de cuenta corriente
            ├── Employees.tsx        # Padrón de personal y asignación de permisos
            ├── Expenses.tsx         # Registro de egresos y gastos de mercadería
            ├── Billing.tsx          # Emisión de facturas fiscales y clientes de CUIT
            ├── Settings.tsx         # Configuración de sucursal, tickets y parámetros
            └── WhatsAppMessages.tsx # Monitor de la cola de mensajes de WhatsApp
```

---

## 8. BASE DE DATOS Y MODELO DE DATOS

La base de datos está implementada sobre **PostgreSQL 15** en Supabase, con extensiones `pgcrypto` y `uuid-ossp`. Contiene 28 tablas relacionales:

### 8.1. Tablas Principales y Relaciones

1. **`products`**:
   * *Campos:* `id` (text, PK), `name`, `brand`, `category_id` (FK `categories`), `subcategory_id` (FK `subcategories`), `price`, `original_price`, `image`, `format`, `stock`, `min_stock`, `barcode`, `sale_type` (`'unit' | 'weight'`), `discount`, `badge`, `branch_id`.
   * *Regla:* Si `sale_type = 'weight'`, el stock y precio se calculan por kilogramo.
2. **`categories`** y **`subcategories`**:
   * Taxonomía de dos niveles para organización de productos.
3. **`orders`**:
   * *Campos:* `id` (text, PK), `date`, `timestamp`, `customer`, `phone`, `dni`, `address`, `delivery_time`, `method` (`'Envío' | 'Retiro' | 'Caja Fija'`), `payment_method` (`'cash' | 'card' | 'transfer' | 'cuenta_corriente'`), `payment_status` (`'Pagado' | 'Pendiente' | 'Fallido'`), `status` (`'Nuevo' | 'Preparando' | 'Listo' | 'En Camino' | 'Entregado' | 'Cancelado'`), `total`, `paid_amount`, `discount`, `discount_label`, `delivery_lat`, `delivery_lng`, `delivery_address_label`, `delivery_house_number`, `delivery_reference`, `delivery_notes`, `delivery_method`, `branch_id`.
4. **`order_items`**:
   * *Campos:* `id` (PK), `order_id` (FK `orders`), `product_id` (FK `products`), `name`, `price`, `quantity`, `image`.
5. **`customer_profiles`**:
   * *Campos:* `id` (PK), `user_id` (FK `auth.users`), `phone` (clave de vinculación única), `name`, `last_name`, `dni`, `address`, `address_lat`, `address_lng`, `credit_limit`, `has_current_account`, `active`.
6. **`cash_movements`**:
   * *Campos:* `id` (PK), `branch_id`, `type` (`'Ingreso' | 'Egreso' | 'Retiro'`), `amount`, `description`, `timestamp`, `cashier`, `order_id` (FK optativa a `orders`).
7. **`cash_closes`**:
   * *Campos:* `id` (PK), `date`, `period`, `totalSales`, `totalOrders`, `cashPayments`, `cardPayments`, `transferPayments`, `cuentaCorrientePayments`, `totalWithdrawals`, `initialAmount`, `openingControlExpected`, `openingControlCounted`, `openingControlDifference`, `openingControlNotes`, `closedAt`.
8. **`expenses`**:
   * *Campos:* `id` (PK), `expense_date`, `type`, `supplier_name`, `amount`, `payment_method`, `payment_status`, `description`, `observations`, `created_by`, `branch_id`.
9. **`invoices`** e **`invoice_items`**:
   * *Campos:* `id` (PK), `date`, `serie`, `folio`, `clientName`, `clientCuit`, `type` (`'A' | 'B' | 'C'`), `subtotal`, `taxes`, `total`, `saleId`, `status`.
10. **`billing_customers`**:
    * Padrón de clientes impositivos con CUIT y condición de IVA (Responsable Inscripto, Monotributo, etc.).
11. **`offers`** y **`offer_redemptions`**:
    * Reglas de promociones automáticas y registro de cada vez que un cliente canjea una oferta.
12. **`employees`**:
    * *Campos:* `id` (PK), `user_id` (FK `auth.users`), `email`, `name`, `role` (`'super_admin' | 'owner' | 'admin' | 'employee'`), `phone`, `branch_id`, `active`, `permissions_override` (jsonb con arrays `allow` y `deny`).
13. **`daily_delivery_assignments`**:
    * Registro de asignación del empleado responsable de los envíos del día.
14. **`whatsapp_messages`**:
    * Cola de mensajería: `id`, `phone`, `customer_name`, `type`, `title`, `message`, `status` (`'pending' | 'sending' | 'sent' | 'failed' | 'cancelled'`), `attempts`, `error_message`, `order_id`.
15. **`shopping_sessions`** y **`shopping_session_items`**:
    * Sesiones temporales de la calculadora de compras física en góndola.
16. **`settings`**:
    * Configuración clave-valor en JSONB: `store_status`, `hero_banners`, `cash_register`, `current_account`, `ticket_config`, `general_config`.

### 8.2. Procedimientos Almacenados Transaccionales (RPC)
* **`process_pos_sale(p_sale jsonb)`:**
  1. Verifica que quien invoca sea un empleado activo (`employees`).
  2. Valida que la caja registradora esté abierta si el método de pago es efectivo.
  3. Ejecuta un bucle sobre cada ítem con `SELECT ... FROM products WHERE id = ... FOR UPDATE` (bloqueo pesimista).
  4. Valida stock suficiente y descuenta el stock en la base de datos.
  5. Recalcula el precio real desde la base de datos (inmune a manipulaciones en el cliente).
  6. Inserta la orden en `orders` y los ítems en `order_items`.
  7. Si fue en efectivo, crea el registro en `cash_movements`.
  8. Retorna el ID de venta y totales calculados.
* **`process_web_order(p_order jsonb)`:**
  1. Valida que contenga ítems y teléfono de contacto.
  2. Itera con `FOR UPDATE` sobre los productos, validando y descontando el stock.
  3. Inserta la orden en estado 'Pendiente'.
  4. Inserta los ítems en `order_items`.

---

## 9. REGLAS DE NEGOCIO IDENTIFICADAS EN EL CÓDIGO

1. **Prioridad del Stock Real sobre el Cliente:** El stock jamás se descuenta en el navegador; siempre se descuenta dentro de una transacción PostgreSQL con bloqueo de fila (`FOR UPDATE`) para evitar ventas simultáneas del último producto.
2. **Bloqueo de Venta en Efectivo si la Caja está Cerrada:** En el POS, si la caja registradora no ha sido abierta con su monto inicial, el sistema impide físicamente concretar cualquier cobro en efectivo.
3. **Mecanismo de Doble Precio (Club Martina Supermercado):**
   * Invitado: Ve precio regular. Si un producto está en oferta, se le muestra el precio promocional como "Ahorro Potencial" instándolo a registrarse.
   * Miembro Autenticado: El descuento se aplica de manera efectiva al subtotal.
4. **Tolerancia y Ajuste por Balanza Real:** Los productos con `sale_type = 'weight'` son estimados en la web según la cantidad indicada. Al prepararse físicamente en la sucursal, el operario debe ingresar el peso exacto; el sistema recalcula el total y notifica la diferencia al cliente.
5. **Reglas de Límite de Cuenta Corriente (Fiado):**
   * Un cliente no puede fiar si su deuda supera `maxDebtAmount` (global o personalizado por cliente).
   * Un cliente no puede fiar si su deuda más antigua tiene más de `maxDebtDays` días de antigüedad.
   * Si la configuración `allowOverride` está activa, un empleado con permiso puede autorizar la operación ingresando obligatoriamente un motivo en `override_reason`.
6. **Radio de Entrega y Tarificación:**
   * Las compras con envío a domicilio solo se procesan si las coordenadas del cliente caen dentro de `deliveryRadiusKm` respecto a las coordenadas del supermercado (`storeLat`, `storeLng`).
   * Si el monto total supera `freeShippingMinAmount`, el costo de envío se bonifica a $0.
7. **Dispositivos de Confianza y Prevención de Trolls (OTP):**
   * En el checkout online, los números que no hayan sido validados previamente en ese navegador deben superar la verificación OTP de 4 dígitos enviada por WhatsApp para que la orden sea aceptada.
   * Los números de teléfono incluidos en `generalConfig.blockedPhones` son rechazados de inmediato.

---

## 10. SEGURIDAD

### Autenticación y Cuentas Sintéticas
* Empleados y administradores inician sesión con su correo electrónico real y contraseña en `/admin/login`.
* Los clientes se registran en la web ingresando únicamente su número de celular y contraseña. Para integrarse limpiamente con Supabase Auth sin forzar al usuario a tener un correo, el sistema crea un email sintético determinista: `549XXXXXXXXXX@lamartina.com`.

### Row Level Security (RLS) en Base de Datos
* Las 28 tablas tienen `ROW LEVEL SECURITY` habilitado.
* Las políticas de seguridad emplean funciones `SECURITY DEFINER` (`is_active_employee()`, `is_admin_or_owner()`, `current_user_phone()`) para evitar ataques de recursión infinita y evaluar los privilegios directamente en el servidor.
* Tablas ultra-sensibles como `cash_movements`, `cash_closes`, `expenses` y `employees` tienen bloqueo de lectura y escritura para usuarios anónimos o clientes; solo empleados autenticados y activos pueden acceder a ellas.
* La tabla `orders` permite a los clientes consultar únicamente aquellos pedidos cuyo teléfono coincida con su teléfono de sesión.

### Protección de Creación de Personal (Edge Function)
* La creación de nuevos empleados se ejecuta en la Edge Function `create-employee` en Deno.
* La función valida el JWT del solicitante, comprueba que sea un empleado activo con rol `super_admin`, `owner` o `admin`, y bloquea cualquier intento de escalamiento de privilegios (un `admin` no puede crear a un `owner` ni a un `super_admin`). Utiliza la clave de servicio `SERVICE_ROLE_KEY` exclusivamente dentro del entorno aislado de Deno.

### Modo Privacidad en Backoffice
* En el panel administrativo existe el botón de **Modo Privacidad**, el cual enmascara todos los montos de facturación, recaudación y dinero en caja con asteriscos (`$ ••••`), permitiendo operar la pantalla a la vista de clientes en el mostrador sin revelar números sensibles del negocio.

### Variables de Entorno (Sin secretos expuestos)
* `VITE_SUPABASE_URL`: Endpoint de la instancia de Supabase.
* `VITE_SUPABASE_ANON_KEY`: Clave pública para consumo del cliente web sujeta a RLS.
* En el servidor/Edge Functions: `SERVICE_ROLE_KEY` (clave maestra para operaciones administrativas) y `PROJECT_URL`.

---

## 11. ESTADO ACTUAL DEL PROYECTO

### Completamente Implementado y Operativo
* Catálogo de productos, categorías, subcategorías y badges.
* Carrito de compras y cálculo de descuentos miembro (Club Martina Supermercado).
* Checkout con mapa interactivo Leaflet, cálculo de envío por distancia y verificación OTP.
* Punto de Venta (POS) multi-pestaña con lector de código de barras, balanza y cobro multi-método.
* Procedimientos transaccionales seguros en PostgreSQL (`process_pos_sale`, `process_web_order`).
* Impresión de tickets térmicos formateados en 58/80 mm.
* Apertura, movimientos manuales, retiros y cierre de caja registradora con control de apertura al día siguiente.
* Módulo de Cuenta Corriente (Fiados), límites de crédito y cobranza de deudas.
* Módulo de Egresos Operativos con impacto en caja chica.
* Gestión de Pedidos con pesaje real de balanza y notificación WhatsApp al cliente y al repartidor.
* Asignación diaria de chofer de delivery.
* Creación segura de empleados con roles y permisos granulares mediante Edge Function.
* Worker local de WhatsApp para envío desatendido de mensajes transaccionales.
* Modo Privacidad para ocultar importes en mostrador.

### Parcialmente Implementado / En Simulación
* **Facturación AFIP (Billing):** La interfaz emite, busca, filtra y agrupa comprobantes tipo A, B y C calculando IVA y totales. Sin embargo, no está conectada directamente a los Web Services SOAP de AFIP (WSAA / WSFE) para obtener el CAE (Código de Autorización Electrónico) oficial en tiempo real; opera actualmente como registro contable interno.
* **Búsqueda Externa de Códigos de Barra:** La función `searchProductExternal` para consultar bases de datos públicas de códigos de barra está estructurada pero retorna resultados simulados o limitados.

---

## 12. DECISIONES TÉCNICAS FUNDAMENTALES

1. **Zustand + React Context en lugar de Redux:** Redujo el código boilerplate al mínimo y ofrece excelente rendimiento para estados locales rápidos como carritos de venta y datos de sesión.
2. **Transacciones en PostgreSQL con `FOR UPDATE` en lugar de endpoints Node:** Al ejecutar la lógica de reserva de stock directamente dentro de la base de datos mediante RPC, se eliminó por completo el riesgo de inconsistencias por concurrencia (*race conditions*) sin necesidad de orquestar un backend complejo.
3. **Caché del Catálogo en Memoria con TTL (`catalogCache.ts`):** En Supabase, el costo de transferencia de datos (*Egress*) puede dispararse con muchas visitas. La proyección de columnas mínimas y la memoria caché en el cliente permitieron reducir drásticamente el consumo de red.
4. **Worker Local con `whatsapp-web.js`:** La API oficial de WhatsApp (Meta Cloud API) cobra por conversación iniciada y exige complejas plantillas aprobadas. Para un comercio de cercanía, utilizar una sesión de WhatsApp Web local en la computadora de caja ofrece costo cero y flexibilidad total de mensajes.
5. **Autenticación Telefónica con Emails Sintéticos:** El cliente promedio de supermercado no recuerda su correo ni contraseña para hacer una compra rápida. Al usar su celular como clave y generar un email sintético, la fricción de entrada se reduce a cero.

---

## 13. PROBLEMAS Y LIMITACIONES CONOCIDAS

* **Dependencia de la Conexión de WhatsApp Web:** Si el celular del supermercado se queda sin batería, sin internet o WhatsApp Web cierra sesión, los mensajes quedan acumulados en estado `pending` en la base de datos hasta que se reanude la sesión.
* **Facturación Fiscal sin CAE Automático:** Las facturas emitidas son comprobantes de gestión interna; para tener validez fiscal ante AFIP deben cargarse manualmente en el portal de Comprobantes en Línea o requerir un bridge futuro con WSFE.
* **Persistencia en LocalStorage para Invitados:** Si un cliente compra como invitado en un navegador privado o borra las cookies, pierde el acceso a la lista de pedidos previos en ese dispositivo.

---

## 14. POSIBLES MEJORAS FUTURAS

1. **Integración con Web Service de Factura Electrónica AFIP (WSFEv1):** Crear una Edge Function que firme el XML con certificado digital y clave privada para obtener el CAE y código QR fiscal de AFIP de forma automática al cerrar una venta en POS o web.
2. **Modo Offline PWA para POS:** Implementar persistencia local con IndexedDB para que la caja pueda seguir cobrando en efectivo aunque se corte la conexión a internet, sincronizando las transacciones con Supabase al restablecerse la red.
3. **Impresión Térmica Directa por Hardware (WebUSB / WebBluetooth):** Enviar comandos directos ESC/POS a la impresora de tickets sin abrir el diálogo emergente de impresión del navegador.

---

## 15. RESUMEN PARA IA

* **Proyecto:** Martina Supermercado.
* **Tipo:** Plataforma web omnicanal integral (E-commerce + POS físico + ERP de gestión de supermercado).
* **Stack:** React 19, TypeScript, Vite 6, Tailwind CSS v4, Zustand 5, Supabase (PostgreSQL 15, Auth, Realtime, Edge Functions Deno), Axios, Leaflet, whatsapp-web.js (Node.js).
* **Arquitectura:** Frontend SPA en Vite consumiendo Supabase vía REST/RPC y WebSockets; procedimientos almacenados transaccionales (`process_pos_sale`, `process_web_order`) con bloqueo pesimista `FOR UPDATE` para control de stock; cola en base de datos (`whatsapp_messages`) leída por un worker local en Node.js que envía mensajes vía WhatsApp Web.
* **Usuarios:** Super Admin, Dueño (Owner), Encargado (Admin), Empleados con presets y permisos granulares, Clientes con Club Martina Supermercado(precios diferenciados) e Invitados.
* **Funcionalidades Clave:** Catálogo y carrito con membresía, calculadora de compras en tienda por código de barras, POS multi-pestaña con balanza de peso, impresión de tickets térmicos y envío digital por WhatsApp, checkout con geolocalización en mapa y tarificación por km, verificación OTP por WhatsApp, ajuste de pedidos web por peso real en balanza, cuenta corriente (fiados) con límites auditados, arqueo y cierre de caja, y control de egresos.
* **Seguridad:** Supabase Auth con emails sintéticos basados en celular, Row Level Security (RLS) estricto en las 28 tablas, Edge Function para aprovisionamiento seguro de personal sin escalada de privilegios y Modo Privacidad en pantalla.
* **Estado:** Totalmente funcional en producción/operación local; facturación fiscal implementada a nivel registro contable (pendiente integración CAE de AFIP).
