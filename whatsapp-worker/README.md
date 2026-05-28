# La Martina - WhatsApp Worker Local 🏪🤖

Este es un servicio autónomo en Node.js que se ejecuta localmente en la computadora del supermercado (donde se tiene iniciada la sesión de WhatsApp Web del local) para procesar de forma automática la cola de mensajes almacenada en Supabase (`whatsapp_messages`).

## Requisitos Previos

1. **Node.js** v16 o superior instalado en la máquina.
2. **Sesión de WhatsApp activa** (un celular que escanee el código QR provisto por la terminal).
3. **Credenciales de Supabase** (URL y la Clave Pública Anon o una clave de servicio si se quiere evitar limitaciones).

## Configuración e Instalación

1. Crea una carpeta llamada `whatsapp-worker` en la computadora local del supermercado (o usa este directorio).
2. Abre la terminal en esta carpeta y corre el siguiente comando para instalar las dependencias:

```bash
npm init -y
npm install @supabase/supabase-js whatsapp-web.js qrcode-terminal dotenv
```

3. Crea un archivo `.env` en la raíz de `whatsapp-worker/` con el siguiente contenido:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu-clave-publica-anon-key-de-supabase
```

4. Coloca el archivo `worker.js` en esta misma carpeta.

## Cómo Ejecutar el Worker

1. Ejecuta el worker en segundo plano corriendo:

```bash
node worker.js
```

2. En la terminal aparecerá un **código QR generado con texto**.
3. Abre WhatsApp en tu celular, ve a **Dispositivos Vinculados** ➔ **Vincular un dispositivo** y escanea el código QR de la terminal.
4. Una vez vinculado, la consola dirá `¡Cliente de WhatsApp listo y conectado!` y comenzará a revisar la base de datos cada 10 segundos buscando mensajes pendientes (`pending`).

## Flujo de Trabajo del Worker

1. **Lectura:** Cada 10 segundos consulta las filas con `status = 'pending'` ordenadas por fecha.
2. **Actualización a "sending":** Cambia el estado del mensaje a `sending` para evitar que otro proceso intente enviarlo simultáneamente.
3. **Envío por WhatsApp:** Utiliza la librería local `whatsapp-web.js` para enviar el mensaje de texto al número formateado.
4. **Finalización:** 
   - Si se envía con éxito: Cambia el estado del mensaje a `sent`, registra la hora en `sent_at` e incrementa `attempts` a `1`.
   - Si falla (número inexistente, desconexión, etc.): Incrementa `attempts`, registra el error en `error_message` y cambia el estado a `failed` (si supera los 3 intentos) o lo deja en `pending` para volver a procesarlo.
