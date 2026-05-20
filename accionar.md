OBJETIVO GENERAL

Sistema web para supermercado
Pedidos online
Gestión interna
Control de stock
Caja registradora
Escalable a futuro

STACK TECNOLÓGICO

FRONTEND

Next.js
React
TypeScript
Tailwind CSS

BACKEND
 vps
Next.js API Routes / Server Actions
TypeScript

BASE DE DATOS

Supabase
PostgreSQL

AUTENTICACIÓN

Supabase Auth

STORAGE

Supabase Storage

DEPLOY

Vercel

ORM

Prisma (opcional más adelante)

DISEÑO / VISUAL

HERRAMIENTAS

Stitch (ideas visuales)
Figma (organización UI)
ChatGPT / Claude / Gemini (estructura y lógica)

REFERENCIAS

Vea
Carrefour
Coto
Día

ESTILO

Diseño moderno
Mobile first
Cards limpias
Buen espaciado
Interfaz clara

MÓDULOS CLIENTE

HOME

Hero principal
Promociones destacadas
Categorías visibles

CATEGORÍAS

Verdulería
Carnicería
Bebidas
Almacén
Limpieza
Congelados

PRODUCTOS

Imagen
Nombre
Precio
Stock visible (opcional)
Botón agregar

BUSCADOR

Buscar productos
Filtrar categorías

PROMOS

Ofertas
Combos
Productos destacados

CARRITO

Agregar productos
Eliminar productos
Modificar cantidad
Calcular total

CHECKOUT

Dirección
Método de pago
Observaciones
Horario de entrega/retiro

MÉTODOS DE PAGO

Efectivo
Transferencia
Tarjeta al recibir

PEDIDOS

Historial de pedidos
Seguimiento:
recibido
preparando
listo
en camino
entregado

WHATSAPP

Consulta de pedidos
Coordinación de entrega

LOGIN / REGISTRO

Registro
Inicio de sesión
Mantener sesión iniciada

MÓDULOS ADMIN

DASHBOARD

Ventas
Pedidos
Productos más vendidos

PRODUCTOS

Crear
Editar
Eliminar
Activar/desactivar

CATEGORÍAS

Crear
Editar

STOCK

Ver stock
Modificar stock
Movimientos de stock

PROMOS

Crear promociones
Crear combos
Activar/desactivar ofertas

PEDIDOS

Ver pedidos
Cambiar estado
Ver datos del cliente

CLIENTES

Historial
Datos básicos

CAJA / POS

Buscar producto
Buscar por código de barras
Agregar productos
Total
Método de pago
Confirmar venta
Descontar stock automáticamente

CÓDIGOS DE BARRA

Campo barcode
Escaneo futuro con cámara

REPORTES

Ventas diarias
Productos más vendidos
Stock bajo

BASE DE DATOS

TABLAS PRINCIPALES

users
profiles
categories
products
product_images
orders
order_items
payment_methods
promos
combo_items
stock_movements
sales
sale_items
cash_register_sessions

COSAS IMPORTANTES

SEGURIDAD

Proteger panel admin
Roles:
cliente
admin
cajero

STOCK

Validar stock antes de compra
Registrar movimientos

OPTIMIZACIÓN

Imágenes comprimidas
Responsive desde inicio

BACKUPS

Backups automáticos

ESCALABILIDAD

Pensar modular
Reutilizable para otros supermercados

ORDEN DE DESARROLLO

Diseño visual
Base de datos
Auth
Home
Categorías
Productos
Carrito
Checkout
Pedidos
Admin
Stock
Caja
Testing
Deploy




SUPERMERCADO V1


1. DEFINICIÓN

Nombre: La Matina
Tipo: supermercado online con pedidos web
Objetivo: recibir pedidos + gestionarlos internamente


2. BASE DE DATOS (DISEÑO INICIAL)

TABLAS:

users
id
nombre
email
password
telefono
direccion
products
id
nombre
descripcion
precio
categoria
stock
activo
categories
id
nombre
orders
id
user_id
total
estado
metodo_pago
direccion_entrega
observaciones
fecha
order_items
id
order_id
product_id
cantidad
precio
promos
id
nombre
descripcion
precio
activa


3. AUTENTICACIÓN (LOGIN / REGISTRO)

Registro de usuario:
nombre
email
contraseña
teléfono
dirección
Login:
email + contraseña
Mantener sesión iniciada


4. HERO

Nombre “La Matina”
Frase principal
Botón “Comprar ahora”


5. CATEGORÍAS

Verdulería
Carnicería
Bebidas
Almacén
Mostrar como grid o menú


6. PRODUCTOS

Cards:
imagen
nombre
precio
botón “Agregar”


7. CARRITO

Agregar productos
Eliminar productos
Modificar cantidad
Mostrar total


8. CHECKOUT

Mostrar resumen
Confirmar dirección (auto desde usuario)
Método de pago:
efectivo
transferencia
tarjeta al recibir
Campo observaciones


9. PEDIDOS

Crear pedido en base de datos
Generar estado inicial: “recibido”
Guardar productos


10. SEGUIMIENTO

Mostrar historial de pedidos del usuario
Ver estado:
recibido
preparando
listo
en camino
entregado


11. WHATSAPP

Botón para:
consultar pedido
coordinar entrega


12. PROMOS Y COMBOS

Mostrar sección ofertas
Productos destacados
Combos especiales


13. PANEL ADMIN (INTERNO)

PRODUCTOS:

agregar
editar
eliminar
activar/desactivar
controlar stock

CATEGORÍAS:

crear
editar

PROMOS:

crear combos
activar/desactivar

PEDIDOS:

ver lista
cambiar estado
ver datos del cliente
ver método de pago


14. DISEÑO

UI moderna
Cards limpias
Buen espaciado


15. RESPONSIVE

Adaptado a celular


16. DEPLOY

Subir a Vercel / servidor
Conectar base de datos


17. TESTING

Crear usuario
Hacer pedido
Ver en panel admin
Cambiar estado



OBJETIVO FINAL

Usuario compra desde la web
Pedido entra al sistema
Supermercado lo gestiona desde panel