# Documentación Técnica: Facturación Electrónica Real con ARCA (ex-AFIP)
## Supermercado La Martina

---

### 1. Arquitectura General y Separación de Responsabilidades

El sistema de facturación electrónica de **Supermercado La Martina** implementa una arquitectura robusta en 3 capas que garantiza el cumplimiento fiscal, la seguridad de las claves criptográficas y la consistencia transaccional:

```
┌────────────────────────────────────────────────────────┐
│                   FRONTEND (React + Vite)              │
│  - Portal de Administración / Facturación (/admin/billing) │
│  - Sin certificados, sin claves privadas, sin secretos │
│  - Generación de UUID v4 para Idempotencia             │
│  - Confirmación previa y visor de QR / PDF fiscal      │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / HTTPS (Proxy /api)
                            ▼
┌────────────────────────────────────────────────────────┐
│                   BACKEND (Node.js + Express)          │
│  - Validador fiscal (Módulo 11 de CUIT, tipos A/B/C)   │
│  - Dynamic WSAA Manager (PKCS#7 CMS con node-forge)    │
│  - Control de Idempotencia y Bloqueo Concurrente       │
│  - Adaptadores: WSMTXCA (con ítems) y WSFEv1           │
│  - Generador de QR oficial (RG 4892/2020)              │
│  - Renderizador de PDF Fiscal con PDFKit               │
└───────────────────────────┬────────────────────────────┘
                            │ SOAP / XML seguro
                            ▼
┌────────────────────────────────────────────────────────┐
│                   ARCA / AFIP Web Services             │
│  - WSAA: Servicio de Autenticación y Autorización      │
│  - WSMTXCA: Facturación Electrónica con detalle        │
│  - WSFEv1: Facturación Electrónica Estándar            │
└────────────────────────────────────────────────────────┘
```

---

### 2. Seguridad de Credenciales y Eliminación de Tokens Fijos

> [!CAUTION]
> **NUNCA** guardes certificados (`.crt`), claves privadas (`.key`) ni tokens en el frontend, en el repositorio Git ni en almacenamiento público.

#### Eliminación de `ARCA_ACCESS_TOKEN`
En versiones anteriores o tutoriales simplificados suele utilizarse una variable estática `ARCA_ACCESS_TOKEN`. En este sistema, **esa variable fue eliminada por diseño**. 

ARCA no utiliza un access token estático. El protocolo oficial requiere:
1. Crear un archivo XML denominado **Ticket de Requerimiento de Acceso (TRA)** con timestamp UTC de generación y expiración (máximo 12 horas).
2. Firmar digitalmente el TRA utilizando el estándar criptográfico **PKCS#7 / CMS** con la clave privada del contribuyente y su certificado X.509 homologado por ARCA.
3. Enviar el CMS en base64 al servicio **WSAA** (`LoginCMS`).
4. Obtener un XML de respuesta que contiene:
   - `Token`: Cadena criptográfica temporal.
   - `Sign`: Firma digital del ticket.
   - `expirationTime`: Fecha/hora límite de validez.

#### Implementación en `server/services/arca/arcaAuth.ts`
- **Firma en memoria con `node-forge`:** No depende de binarios externos de OpenSSL instalados en el sistema operativo, permitiendo ejecución multiplataforma transparente (Windows, Linux, Docker, macOS).
- **Caché inteligente:** El `Token` y `Sign` se reutilizan en memoria mientras sean válidos, renovándose automáticamente 10 minutos antes de expirar.
- **Mutex / Single-Flight Promise Lock:** Si múltiples clientes solicitan emitir facturas simultáneamente cuando el ticket está vencido, una única solicitud ejecuta el llamado a WSAA y las demás esperan la misma resolución, evitando bloqueos y rechazos por concurrencia en los servidores de ARCA.

---

### 3. Variables de Entorno del Backend

Configurar en el archivo `.env` del servidor o en las variables de entorno de producción:

```ini
# Entorno de ARCA ('testing' para Homologación, 'production' para Producción)
ARCA_ENV=testing

# CUIT del titular de la empresa (11 dígitos numéricos sin guiones)
ARCA_CUIT=20123456786

# Rutas absolutas o relativas al certificado X.509 y clave privada RSA
ARCA_CERT_PATH=./server/certs/arca-testing.crt
ARCA_KEY_PATH=./server/certs/arca-testing.key

# Punto de venta fiscal habilitado para Web Services en ARCA
ARCA_PV=1

# Nombre comercial para el encabezado del comprobante y PDF
ARCA_BUSINESS_NAME="Supermercado La Martina"
ARCA_BUSINESS_ADDRESS="Av. Principal 1234, Local 5, Buenos Aires"
ARCA_IIBB="901-123456-7"
ARCA_START_DATE="2020-01-01"

# Puerto del servidor backend Express
PORT=5000
```

---

### 4. Guía Paso a Paso para Obtener Certificados en ARCA (ex-AFIP)

#### A. Entorno de Homologación (Testing / Pruebas)
1. Ingresar a la página oficial de ARCA/AFIP con CUIT y Clave Fiscal.
2. Ingresar al servicio **"WSASS - Autenticación y Autorización en Servicios Web de AFIP (Homologación)"**.
3. Generar una clave privada RSA y un CSR (Certificate Signing Request):
   ```bash
   openssl genrsa -out arca-testing.key 2048
   openssl req -new -key arca-testing.key -subj "/C=AR/O=Supermercado La Martina/CN=martina-testing/serialNumber=CUIT 20123456786" -out arca-testing.csr
   ```
4. Subir el `.csr` en WSASS y descargar el certificado generado (ej. `arca-testing.crt`).
5. Autorizar el computador fiscal para los servicios `wsmtxca` (Facturación con detalle) y `wsfe` (Facturación estándar).

#### B. Entorno de Producción
1. Ingresar con Clave Fiscal (Nivel 3 o superior).
2. Habilitar el servicio **"Administración de Certificados Digitales"**.
3. Crear un nuevo "Alias" (ejemplo: `lamartina-facturacion`).
4. Generar el par de claves privadas y CSR de producción y subirlo.
5. Descargar el certificado X.509 de producción.
6. Ir a **"Administrador de Relaciones de Clave Fiscal"**:
   - Nueva Relación -> Buscar servicio ARCA -> **"Facturación Electrónica"** -> **"Web Service Factura Electrónica MTX"** (`wsmtxca`) y vincularlo al alias creado.
   - Repetir para **"Web Service Factura Electrónica"** (`wsfe`).
7. Ir a **"Administración de Puntos de Venta y Domicilios"**:
   - Agregar un nuevo punto de venta.
   - Tipo de emisión: **"Factura Electrónica - Web Services"**.
   - Asignar el número de punto de venta (por ejemplo `00001` o `00002`).

---

### 5. Idempotencia y Prevención de Duplicados

Para cumplir con la exigencia de evitar facturaciones duplicadas bajo reintentos de red o clics repetidos:

1. **UUID v4 (`X-Idempotency-Key`):** El cliente React genera un identificador único universal antes de enviar la petición de facturación.
2. **Tabla `fiscal_invoice_operations`:**
   - La base de datos registra la clave de idempotencia con restricción `UNIQUE`.
   - Si llega una solicitud con una clave ya procesada con éxito, el backend responde inmediatamente con el comprobante ya emitido y su CAE, sin volver a llamar a ARCA.
   - Si la operación está en estado `EN_PROCESO`, se rechaza con código HTTP 409 (Conflict).
3. **Validación de ventas ya facturadas:** Si se intenta facturar un ticket o consolidar órdenes que ya poseen un número de comprobante fiscal asignado, el sistema interrumpe el flujo y muestra una alerta con el número de comprobante existente.

---

### 6. Clasificación de Errores y Procedimiento de Reconciliación

El sistema categoriza explícitamente los estados de respuesta de ARCA:

| Estado | Significado | Acción del Sistema |
|---|---|---|
| `AUTORIZADA` | CAE otorgado por ARCA | Factura grabada como "Emitida". Generación de QR y PDF. |
| `RECHAZADA` | ARCA rechazó los datos (ej: CUIT inválido, punto de venta no habilitado) | Se informa el motivo exacto al cajero/administrador. **NO se incrementa la numeración fiscal**. |
| `TIMEOUT` / `ESTADO_DESCONOCIDO` | Se cortó la conexión antes de recibir la confirmación de ARCA | **NO reintentar a ciegas**. Se activa el botón de **Reconciliar**. |

#### Cómo funciona la Reconciliación (`/api/arca/operations/:id/reconcile`):
1. El backend consulta el último comprobante autorizado en ARCA para ese Punto de Venta y Tipo de Comprobante (`consultarUltimoComprobanteAutorizado`).
2. Si el número coincide con el de la operación pendiente y los importes cuadran, se recupera el CAE directamente de los servidores de ARCA y se finaliza la factura.
3. Si el comprobante nunca llegó a ARCA, la operación se libera de forma segura para permitir su emisión sin saltear correlatividad.

---

### 7. Código QR Oficial (RG 4892/2020)

El código QR impreso en los tickets y comprobantes cumple estrictamente con el formato exigido por la Resolución General 4892/2020 de AFIP:

```
https://www.afip.gob.ar/fe/qr/?p=<JSON_BASE64>
```

#### Estructura del JSON codificado:
```json
{
  "ver": 1,
  "fecha": "2026-09-14",
  "cuit": 20123456786,
  "ptoVta": 1,
  "tipoCmp": 1,
  "nroCmp": 124,
  "importe": 4025.00,
  "moneda": "PES",
  "ctz": 1,
  "tipoDocRec": 80,
  "nroDocRec": 20300000003,
  "tipoCodAut": "E",
  "codAut": 74123456789012
}
```

Al escanear el QR con la cámara de un teléfono inteligente o con la app de ARCA, se redirige inmediatamente a la pantalla oficial de constatación de comprobantes.

---

### 8. Régimen de Factura A para Monotributistas (RG 5003/2021)

Cuando el emisor es **Responsable Inscripto** y el receptor es **Monotributista**:
- El sistema emite obligatoriamente una **Factura A** (código `01`).
- Se discrimina el IVA normalmente.
- Se incluye de manera automática la leyenda legal requerida:
  > *"El crédito fiscal discriminado en el presente comprobante, sólo podrá ser computado a efectos del Régimen de Sostenimiento e Inclusión Fiscal para Pequeños Contribuyentes de la Ley Nº 27.618."*

---

### 9. Ejecución y Puesta en Marcha

#### Modo Desarrollo Local:
Ejecutar en terminales separadas o con concurrencia:
```bash
# Terminal 1: Servidor Backend Express (puerto 5000)
npm run dev:server

# Terminal 2: Frontend Vite React (puerto 3000 con proxy a /api)
npm run dev
```

#### Pruebas Automatizadas:
Para validar los 29 tests unitarios y de integración de cálculo fiscal, CUIT módulo 11, WSMTXCA, QR y PDF:
```bash
npx tsx tests/arca.test.ts
```

#### Migración de Base de Datos:
Ejecutar el script SQL en el panel de Supabase o cliente PostgreSQL:
- Archivo: `supabase/migrations/20260914000000_arca_fiscal_billing.sql`
- O el archivo raíz consolidado: `supabase_arca_billing_migration.sql`

---

### 10. Checklist de Transición a Producción

- [ ] Certificado X.509 de producción emitido por la Autoridad Certificante de ARCA y clave privada generada con 2048 bits.
- [ ] Punto de Venta de Web Services creado en el portal de ARCA y verificado.
- [ ] Servicios `wsmtxca` y `wsfe` vinculados al certificado mediante el Administrador de Relaciones de Clave Fiscal.
- [ ] Variables de entorno configuradas: `ARCA_ENV=production`, `ARCA_CUIT`, `ARCA_PV`, rutas a los certificados.
- [ ] Ejecutada la migración SQL de `fiscal_invoice_operations` e `invoices` en la base de datos de producción.
- [ ] Realizada una primera emisión de prueba con comprobante de importe mínimo y verificada su constatación en el portal "Comprobantes en Línea" de ARCA.
