# Guía de Configuración de Seguridad en Cloudflare - Martina Supermercado

Esta guía documenta los pasos y parámetros exactos que deben configurarse en el panel de **Cloudflare** para proteger el dominio de **Martina Supermercado** frente a ataques DDoS, bots automatizados, fuerza bruta en el login administrativo y fugas de datos.

---

## 1. Configuración de DNS y Proxy

1. En el menú **DNS** > **Records**:
   - Asegurarse de que los registros `A`, `AAAA` o `CNAME` que apuntan al hosting (ej. Vercel) tengan el estado **Proxied** (Nube naranja activada: `DNS and HTTP proxy(CDN)`).
   - Esto oculta la dirección IP real del servidor de origen y canaliza todo el tráfico a través del WAF de Cloudflare.

---

## 2. Configuración de SSL/TLS (Cifrado Extremo a Extremo)

1. Ir a **SSL/TLS** > **Overview**:
   - Seleccionar el modo de cifrado **Full (Strict)**.
   - *Motivo:* Garantiza que el tráfico esté 100% cifrado entre el cliente y Cloudflare, y también entre Cloudflare y el servidor de origen con certificados válidos.
2. En **SSL/TLS** > **Edge Certificates**:
   - **Always Use HTTPS**: Activar (`ON`). Redirige automáticamente cualquier intento `http://` a `https://`.
   - **Minimum TLS Version**: Seleccionar `TLS 1.2`. (Deshabilita versiones vulnerables TLS 1.0 y 1.1).
   - **Opportunistic Encryption**: Activar (`ON`).
   - **TLS 1.3**: Activar (`ON`).
   - **Automatic HTTPS Rewrites**: Activar (`ON`). Corrige enlaces mixtos (Mixed Content).

---

## 3. Web Application Firewall (WAF) y Reglas de Protección

### A. Protección contra Bots (Bot Fight Mode)
1. Ir a **Security** > **Bots**:
   - Activar **Bot Fight Mode** (`ON`).
   - Bloquea o desafía con JavaScript a bots maliciosos conocidos, scrapers de catálogos y herramientas de escaneo automatizado.

### B. Regla de Rate Limiting para Login Administrativo (Fuerza Bruta)
1. Ir a **Security** > **WAF** > pestaña **Rate limiting rules**:
2. Crear una nueva regla:
   - **Rule Name**: `Proteger Login Admin Martina Supermercado`
   - **When incoming requests match**:
     - Campo: `URI Path`
     - Operador: `equals`
     - Valor: `/admin/login`
     - Y además: `Request Method` `equals` `POST`
   - **Rate limiting criteria**:
     - Contador de peticiones: `10 peticiones`
     - Período: `1 minuto`
   - **Action**:
     - Elegir: `Block` o `Managed Challenge` (Desafío interactivo Cloudflare Turnstile).
     - Duración: `10 minutos`.
   - *Impacto:* Impide ataques de diccionario o fuerza bruta automatizados sobre las credenciales del personal.

### C. Regla de Bloqueo Geográfico o Bloqueo de Amenazas
1. Ir a **Security** > **WAF** > pestaña **Custom rules**:
   - Si la tienda opera únicamente en Argentina, se puede crear una regla que desafíe o bloquee tráfico proveniente de países de alto riesgo de botnets sin clientes reales.
   - Expresión sugerida:
     `ip.geoip.country ne "AR" and not cf.client.bot and http.request.uri.path contains "/admin"`
   - Acción: `Managed Challenge`.

---

## 4. Reglas de Caché y Supabase (CRÍTICO: No Romper APIs ni WebSockets)

Para no interferir con la sincronización en tiempo real de Supabase ni con las peticiones POST/PATCH de productos y pedidos:

1. Ir a **Network**:
   - **WebSockets**: Asegurarse de que esté en `ON`. (Necesario para el canal Realtime de Supabase: pedidos nuevos, estado de caja, etc.).
2. En **Caching** > **Cache Rules**:
   - Crear una regla de Bypass de Caché:
     - Nombre: `Bypass Supabase & APIs`
     - Condición: `URI Path contains "/rest/v1/" or URI Path contains "/auth/v1/" or URI Path contains "/functions/v1/" or URI Path contains "/realtime/v1/"`
     - Acción: `Bypass Cache` (Elegibilidad de caché: Desactivada).
   - *Impacto:* Garantiza que las respuestas de la base de datos nunca queden cacheadas en los servidores proxy de Cloudflare.

---

## 5. Recomendación Opcional: Cloudflare Zero Trust (Access)

Para la máxima seguridad del portal `/admin`:
1. Habilitar **Cloudflare Zero Trust** (plan gratuito hasta 50 usuarios).
2. Crear una aplicación tipo **Self-hosted** para la ruta `tudominio.com/admin*`.
3. Exigir autenticación previa mediante PIN temporal enviado al correo del dueño/administrador o mediante Google Workspace antes de mostrar la pantalla de login.
