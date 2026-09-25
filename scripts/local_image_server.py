import os
import sys
import json
import uuid
import re
import io
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from PIL import Image

# Agregar al path para importar los scripts originales sin modificarlos
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'imagenes de productos'))
import descargar_imagenes
import subir_a_r2

# 3. Estado temporal de candidatos
# Cache temporal en memoria. NO exponemos URLs que el frontend pueda alterar.
# Formato: { "uuid-seguro": { "url": "https://...", "title": "..." } }
SEARCH_CACHE = {}

# 1. CORS restrictivo
ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://127.0.0.1:3000", "https://la-martina.vercel.app"]

class ImageSelectorHandler(BaseHTTPRequestHandler):
    def send_cors_headers(self):
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
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

    def handle_search(self):
        try:
            content_length = int(self.headers['Content-Length'])
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

            candidates = []
            slug = descargar_imagenes.quote(query.replace(' ', '-').lower())
            url_ml = f"https://listado.mercadolibre.com.ar/{slug}"
            
            try:
                resp = session.get(url_ml, timeout=10)
                if "account-verification" not in resp.url and "suspicious-traffic" not in resp.text and resp.status_code == 200:
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
                        if not img_el: continue
                        img_url = img_el.get("data-src") or img_el.get("src")
                        if not img_url or not img_url.startswith("http"): continue
                        
                        if re.search(r"-[A-Z]\.webp$", img_url):
                            img_url = re.sub(r"-[A-Z]\.webp$", "-O.webp", img_url)
                            
                        # 3 y 6. Identificador temporal y metadata
                        cand_id = str(uuid.uuid4())
                        SEARCH_CACHE[cand_id] = {"url": img_url, "title": title}
                        candidates.append({"id": cand_id, "url": img_url, "title": title, "source": "Mercado Libre"})
                
                # 6. Fallback si no hay candidatos de ML
                if len(candidates) == 0:
                    clean_q = f"{query} supermercado argentina"
                    url_bing = f"https://www.bing.com/images/search?q={descargar_imagenes.quote(clean_q)}&first=1"
                    resp = session.get(url_bing, timeout=10)
                    soup = descargar_imagenes.BeautifulSoup(resp.text, "html.parser")
                    for a in soup.find_all("a", class_="iusc"):
                        if len(candidates) >= 6:
                            break
                        m_data = a.get("m")
                        if m_data:
                            try:
                                m_json = json.loads(m_data)
                                img_url = m_json.get("murl")
                                title = m_json.get("t", "Imagen de Bing")
                                if img_url and img_url.startswith("http"):
                                    # Evitar resultados basura (tendencias) si Bing no encuentra nada
                                    query_words = set(w.lower() for w in query.split() if len(w) > 2)
                                    title_lower = title.lower()
                                    if len(query_words) > 0 and not any(w in title_lower for w in query_words):
                                        continue
                                    
                                    cand_id = str(uuid.uuid4())
                                    SEARCH_CACHE[cand_id] = {"url": img_url, "title": title}
                                    candidates.append({"id": cand_id, "url": img_url, "title": title, "source": "Bing"})
                            except:
                                pass

            except Exception as e:
                pass

            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"candidates": candidates}).encode())

        except Exception as e:
            self.send_error(500, str(e))

    def handle_upload(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            candidate_id = data.get("candidate_id")
            product_id = data.get("product_id")
            
            # 2. Endpoint /upload asegurado. Comprobamos la cache temporal.
            if not candidate_id or not product_id or candidate_id not in SEARCH_CACHE:
                self.send_error(400, "Candidato inválido o no encontrado")
                return
                
            candidate = SEARCH_CACHE[candidate_id]
            img_url = candidate["url"]
            
            session = descargar_imagenes.requests.Session()
            session.headers.update(descargar_imagenes.get_random_headers())
            
            # 9. Calidad de la imagen
            resp = session.get(img_url, timeout=10)
            resp.raise_for_status()
            
            # Validar que sea una imagen que Pillow puede abrir
            img = Image.open(io.BytesIO(resp.content))
            
            # Validar dimensiones razonables
            if img.width < 50 or img.height < 50:
                self.send_error(400, "Imagen demasiado pequeña")
                return
                
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
                
            out_io = io.BytesIO()
            img.save(out_io, "WEBP", quality=88, method=6)
            out_io.seek(0)
            
            # Nombre de archivo seguro relacionado con el producto
            safe_id = re.sub(r"[^a-zA-Z0-9-]", "", str(product_id))
            filename = f"prod_{safe_id}_{int(time.time())}.webp"
            
            # 5. R2 credenciales nunca tocan el frontend
            s3 = subir_a_r2.get_r2_client()
            s3.put_object(
                Bucket=subir_a_r2.BUCKET_NAME,
                Key=filename,
                Body=out_io,
                ContentType="image/webp",
                CacheControl="public, max-age=31536000, immutable"
            )
            
            final_url = f"https://pub-b2edd10480974538871db5818f481f1b.r2.dev/{filename}"
            
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "url": final_url}).encode())
            
        except Exception as e:
            self.send_error(500, f"Error interno: {str(e)}")

    def handle_upload_custom(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            custom_url = data.get("url")
            product_id = data.get("product_id")
            
            if not custom_url or not product_id:
                self.send_error(400, "URL y product_id son requeridos")
                return
                
            session = descargar_imagenes.requests.Session()
            session.headers.update(descargar_imagenes.get_random_headers())
            
            resp = session.get(custom_url, timeout=10)
            resp.raise_for_status()
            
            # Validar que sea una imagen que Pillow puede abrir
            img = Image.open(io.BytesIO(resp.content))
            if img.width < 50 or img.height < 50:
                self.send_error(400, "Imagen demasiado pequeña")
                return
                
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
                
            out_io = io.BytesIO()
            img.save(out_io, "WEBP", quality=88, method=6)
            out_io.seek(0)
            
            safe_id = re.sub(r"[^a-zA-Z0-9-]", "", str(product_id))
            filename = f"prod_{safe_id}_{int(time.time())}.webp"
            
            s3 = subir_a_r2.get_r2_client()
            s3.put_object(
                Bucket=subir_a_r2.BUCKET_NAME,
                Key=filename,
                Body=out_io,
                ContentType="image/webp",
                CacheControl="public, max-age=31536000, immutable"
            )
            
            final_url = f"https://pub-b2edd10480974538871db5818f481f1b.r2.dev/{filename}"
            
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "url": final_url}).encode())
            
        except Exception as e:
            self.send_error(500, f"Error al procesar la URL: {str(e)}")

if __name__ == '__main__':
    server_address = ('127.0.0.1', 8765)
    httpd = HTTPServer(server_address, ImageSelectorHandler)
    print("Iniciando local_image_server.py seguro en http://127.0.0.1:8765")
    httpd.serve_forever()
