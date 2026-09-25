import os
import sys
import json
import uuid
import re
import io
import time
import html
from http.server import HTTPServer, BaseHTTPRequestHandler
from PIL import Image

# Agregar al path para importar los scripts originales sin modificarlos
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'imagenes de productos'))
import descargar_imagenes
import subir_a_r2

# Cache temporal en memoria. NO exponemos URLs que el frontend pueda alterar.
# Formato: { "uuid-seguro": { "url": "https://...", "title": "..." } }
SEARCH_CACHE = {}

# Orígenes permitidos (además de cualquier localhost / 127.0.0.1 dinámico)
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://la-martina.vercel.app"
]

def is_origin_allowed(origin: str) -> bool:
    if not origin:
        return False
    if origin in ALLOWED_ORIGINS:
        return True
    if origin.startswith("http://localhost:") or origin.startswith("http://127.0.0.1:"):
        return True
    return False

class ImageSelectorHandler(BaseHTTPRequestHandler):
    def send_cors_headers(self):
        origin = self.headers.get("Origin", "")
        if is_origin_allowed(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
        else:
            self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path in ('/', '/health'):
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "service": "local_image_server"}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == '/search':
            self.handle_search()
        elif self.path == '/upload':
            self.handle_upload()
        elif self.path == '/upload_custom_url':
            self.handle_upload_custom()
        else:
            self.send_response(404)
            self.end_headers()

    def search_mercadolibre(self, query: str, session) -> list:
        candidates = []
        slug = descargar_imagenes.quote(query.replace(' ', '-').lower())
        url_ml = f"https://listado.mercadolibre.com.ar/{slug}"
        try:
            resp = session.get(url_ml, timeout=8)
            if resp.status_code == 200 and "account-verification" not in resp.url and "suspicious-traffic" not in resp.text:
                soup = descargar_imagenes.BeautifulSoup(resp.text, "html.parser")
                cards = soup.select(".poly-card, .ui-search-layout__item, .ui-search-result")
                for card in cards:
                    if len(candidates) >= 6:
                        break
                    title_el = card.select_one(".poly-component__title, .ui-search-item__title, h2, h3")
                    title = title_el.get_text(strip=True) if title_el else ""
                    if not title:
                        continue

                    img_el = card.select_one('img[src*="http2.mlstatic.com"], img[data-src*="http2.mlstatic.com"]') or card.select_one("img")
                    if not img_el:
                        continue
                    img_url = img_el.get("data-src") or img_el.get("src")
                    if not img_url or not img_url.startswith("http"):
                        continue

                    if re.search(r"-[A-Z]\.webp$", img_url):
                        img_url = re.sub(r"-[A-Z]\.webp$", "-O.webp", img_url)

                    cand_id = str(uuid.uuid4())
                    SEARCH_CACHE[cand_id] = {"url": img_url, "title": title}
                    candidates.append({"id": cand_id, "url": img_url, "title": title, "source": "Mercado Libre"})
        except Exception as e:
            print(f"[ML Search Error]: {e}")
        return candidates

    def search_bing(self, query: str, session) -> list:
        candidates = []
        clean_q = query.strip()
        url_bing = f"https://www.bing.com/images/search?q={descargar_imagenes.quote(clean_q)}"
        try:
            resp = session.get(url_bing, timeout=10)
            if resp.status_code == 200:
                soup = descargar_imagenes.BeautifulSoup(resp.text, "html.parser")
                tags = soup.select("a.iusc")
                for tag in tags:
                    if len(candidates) >= 8:
                        break
                    m_data = tag.get("m")
                    if not m_data:
                        continue
                    try:
                        m_json = json.loads(m_data)
                        img_url = m_json.get("murl")
                        raw_title = m_json.get("t", "Imagen de producto")
                        title = html.unescape(raw_title).replace('\ue000', '').replace('\ue001', '').strip()

                        if not img_url or not img_url.startswith("http"):
                            continue
                        if any(bad in img_url.lower() for bad in ["logo", "icon", "vector", "placeholder", "sprite", "base64"]):
                            continue

                        cand_id = str(uuid.uuid4())
                        SEARCH_CACHE[cand_id] = {"url": img_url, "title": title}
                        candidates.append({"id": cand_id, "url": img_url, "title": title, "source": "Bing"})
                    except Exception:
                        continue

                # Si el selector iusc falló por cambio en DOM, intentar fallback regex de murl
                if len(candidates) == 0:
                    murls = re.findall(r'murl&quot;:&quot;(http[^&]+)&quot;', resp.text)
                    for murl in murls[:6]:
                        cand_id = str(uuid.uuid4())
                        SEARCH_CACHE[cand_id] = {"url": murl, "title": query}
                        candidates.append({"id": cand_id, "url": murl, "title": query, "source": "Bing"})
        except Exception as e:
            print(f"[Bing Search Error]: {e}")
        return candidates

    def handle_search(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))

            query = data.get("query", "").strip()[:100]
            if not query:
                self.send_error(400, "Query is empty")
                return

            session = descargar_imagenes.requests.Session()
            adapter = descargar_imagenes.requests.adapters.HTTPAdapter(pool_connections=15, pool_maxsize=15, max_retries=2)
            session.mount("https://", adapter)
            session.mount("http://", adapter)
            session.headers.update(descargar_imagenes.get_random_headers())

            # 1. Intentar Mercado Libre
            candidates = self.search_mercadolibre(query, session)

            # 2. Si ML no devolvió o fue bloqueado por WAF, usar Bing
            if len(candidates) == 0:
                candidates = self.search_bing(query, session)

            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"candidates": candidates}).encode('utf-8'))

        except Exception as e:
            self.send_response(500)
            self.send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

    def process_and_upload_image(self, img_url: str, product_id: str) -> str:
        session = descargar_imagenes.requests.Session()
        headers = descargar_imagenes.get_random_headers()
        headers["Referer"] = img_url
        session.headers.update(headers)

        resp = session.get(img_url, timeout=12)
        resp.raise_for_status()

        img = Image.open(io.BytesIO(resp.content))

        # Validar dimensiones razonables
        if img.width < 50 or img.height < 50:
            raise ValueError("La imagen es demasiado pequeña para usarse como producto.")

        # Preservar transparencia componiendo sobre fondo blanco en lugar de dejar fondo negro
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            background = Image.new("RGB", img.size, (255, 255, 255))
            rgba_img = img.convert("RGBA")
            background.paste(rgba_img, mask=rgba_img.split()[3])
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        out_io = io.BytesIO()
        img.save(out_io, "WEBP", quality=88, method=6)
        image_bytes = out_io.getvalue()

        safe_id = re.sub(r"[^a-zA-Z0-9-]", "", str(product_id))
        filename = f"prod_{safe_id}_{int(time.time())}.webp"

        s3 = subir_a_r2.get_r2_client()
        s3.put_object(
            Bucket=subir_a_r2.BUCKET_NAME,
            Key=filename,
            Body=image_bytes,
            ContentType="image/webp",
            CacheControl="public, max-age=31536000, immutable"
        )

        return f"https://pub-b2edd10480974538871db5818f481f1b.r2.dev/{filename}"

    def handle_upload(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))

            candidate_id = data.get("candidate_id")
            product_id = data.get("product_id")

            if not candidate_id or not product_id or candidate_id not in SEARCH_CACHE:
                self.send_response(400)
                self.send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Candidato inválido o expirado"}).encode('utf-8'))
                return

            candidate = SEARCH_CACHE[candidate_id]
            final_url = self.process_and_upload_image(candidate["url"], product_id)

            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "url": final_url}).encode('utf-8'))

        except Exception as e:
            self.send_response(500)
            self.send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Error al procesar la imagen: {str(e)}"}).encode('utf-8'))

    def handle_upload_custom(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))

            custom_url = data.get("url")
            product_id = data.get("product_id")

            if not custom_url or not product_id:
                self.send_response(400)
                self.send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "URL y product_id son requeridos"}).encode('utf-8'))
                return

            final_url = self.process_and_upload_image(custom_url.strip(), product_id)

            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "url": final_url}).encode('utf-8'))

        except Exception as e:
            self.send_response(500)
            self.send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"Error al procesar la URL: {str(e)}"}).encode('utf-8'))

if __name__ == '__main__':
    server_address = ('127.0.0.1', 8765)
    httpd = HTTPServer(server_address, ImageSelectorHandler)
    print("=" * 60)
    print("  🚀 Servidor de imágenes iniciado en http://127.0.0.1:8765")
    print("  Compatible con búsqueda de packshots y subida directa a R2")
    print("=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
