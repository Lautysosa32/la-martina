import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STOP_WORDS = new Set([
  "de", "la", "el", "en", "y", "a", "los", "las", "del", "para", "con",
  "por", "al", "un", "una", "unos", "unas", "sin", "sobre", "tras", "o", "x"
]);

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0",
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function slugify(text: string): string {
  if (!text) return "producto";
  let clean = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  clean = clean.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  if (clean.length > 70) clean = clean.substring(0, 70).replace(/-+$/, "");
  return clean || "producto";
}

function esRelevante(query: string, title: string): boolean {
  if (!title) return true;
  const queryTokens = query.toLowerCase().match(/\w+/g) || [];
  const titleTokens = new Set(title.toLowerCase().match(/\w+/g) || []);
  
  const keywords = queryTokens.filter(t => t.length > 1 && !STOP_WORDS.has(t));
  if (keywords.length === 0) return true;
  
  for (const kw of keywords) {
    if (titleTokens.has(kw)) return true;
  }
  return false;
}

function isLocalOrPrivateIP(hostname: string): boolean {
  if (hostname === 'localhost') return true;
  if (hostname.endsWith('.localhost')) return true;

  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const match = hostname.match(ipv4Regex);
  if (match) {
    const p1 = parseInt(match[1], 10);
    const p2 = parseInt(match[2], 10);
    
    if (p1 === 10) return true; 
    if (p1 === 127) return true; 
    if (p1 === 192 && p2 === 168) return true; 
    if (p1 === 172 && (p2 >= 16 && p2 <= 31)) return true; 
    if (p1 === 169 && p2 === 254) return true; 
  }

  if (hostname === '::1') return true;
  if (hostname.toLowerCase().startsWith('fc') || hostname.toLowerCase().startsWith('fd')) return true;
  if (hostname.toLowerCase().startsWith('fe80')) return true;

  return false;
}

function isValidImageUrl(imgUrl: string): boolean {
  try {
    const parsed = new URL(imgUrl);
    
    if (parsed.protocol !== 'https:') {
      return false;
    }
    
    if (isLocalOrPrivateIP(parsed.hostname)) {
      return false;
    }

    const urlLower = imgUrl.toLowerCase();
    const badWords = ["logo", "icon", "vector", "placeholder"];
    if (badWords.some(bw => urlLower.includes(bw))) {
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": getRandomUserAgent(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
        "Upgrade-Insecure-Requests": "1"
      },
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

async function searchMercadoLibre(query: string) {
  const slug = slugify(query);
  const searchUrl = `https://listado.mercadolibre.com.ar/${slug}`;
  
  console.log(`[ML] Fetching: ${searchUrl}`);
  try {
    const resp = await fetchWithTimeout(searchUrl, 10000); 
    console.log(`[ML] Status: ${resp.status}, URL Final: ${resp.url}`);
    
    if (!resp.ok) return { error: `HTTP_${resp.status}` };
    
    const html = await resp.text();
    console.log(`[ML] HTML Length: ${html.length} bytes`);
    
    if (resp.url.includes("account-verification") || html.includes("suspicious-traffic")) {
      console.warn(`[ML] WAF CHALLENGE DETECTED!`);
      return { error: "WAF_CHALLENGE" };
    }
    
    const $ = cheerio.load(html);
    const results: any[] = [];
    
    const cards = $(".poly-card, .ui-search-layout__item, .ui-search-result");
    console.log(`[ML] Cards encontradas: ${cards.length}`);
    let imagesExtracted = 0;
    
    cards.each((_, el) => {
      if (results.length >= 8) return; 
      
      const titleEl = $(el).find(".poly-component__title, .ui-search-item__title, h2, h3");
      const itemTitle = titleEl.text().trim();
      
      if (!esRelevante(query, itemTitle)) return;
      
      const imgEl = $(el).find('img[src*="http2.mlstatic.com"], img[data-src*="http2.mlstatic.com"], img');
      if (!imgEl.length) return;
      
      let imgUrl = imgEl.attr("data-src") || imgEl.attr("src") || "";
      if (!isValidImageUrl(imgUrl)) return;
      
      if (/-[A-Z]\.webp$/.test(imgUrl)) {
        imgUrl = imgUrl.replace(/-[A-Z]\.webp$/, "-O.webp");
      }
      
      if (!results.some(r => r.url === imgUrl)) {
        imagesExtracted++;
        results.push({ url: imgUrl, source: 'Mercado Libre', title: itemTitle });
      }
    });
    
    console.log(`[ML] Imágenes extraídas válidas: ${imagesExtracted}`);
    return { results: results.slice(0, 5) };
  } catch (err: any) {
    if (err.name === 'AbortError') return { error: "TIMEOUT" };
    return { error: `ERROR_${err.message?.substring(0, 40)}` };
  }
}

async function searchBing(query: string) {
  const cleanQ = encodeURIComponent(`${query} supermercado argentina`);
  const url = `https://www.bing.com/images/search?q=${cleanQ}&first=1`;
  
  console.log(`[BING] Fetching: ${url}`);
  try {
    const resp = await fetchWithTimeout(url, 10000);
    console.log(`[BING] Status: ${resp.status}`);
    
    if (!resp.ok) return { error: `HTTP_${resp.status}` };
    
    const html = await resp.text();
    console.log(`[BING] HTML Length: ${html.length} bytes`);
    
    const $ = cheerio.load(html);
    const results: any[] = [];
    
    const iuscElements = $("a.iusc");
    let selectorUtilizado = "";
    let beforeFilter = 0;
    let discardedByRelevance = 0;

    if (iuscElements.length > 0) {
      selectorUtilizado = "a.iusc (Desktop Rich)";
      console.log(`[BING] Elementos a.iusc encontrados: ${iuscElements.length}`);
      
      iuscElements.each((_, el) => {
        if (results.length >= 5) return;
        try {
          const mAttr = $(el).attr("m");
          if (!mAttr) return;
          const mData = JSON.parse(mAttr);
          const murl = mData.murl;
          const title = mData.t || "";
          
          if (murl && isValidImageUrl(murl)) {
            beforeFilter++;
            if (esRelevante(query, title)) {
              if (!results.some(r => r.url === murl)) {
                results.push({ url: murl, source: 'Bing', title });
              }
            } else {
              discardedByRelevance++;
            }
          }
        } catch (e) {}
      });
    } else {
      selectorUtilizado = "img (Lite/Datacenter Fallback)";
      const imgElements = $("img");
      console.log(`[BING] Elementos img encontrados: ${imgElements.length}`);

      // ==== DIAGNÓSTICO TEMPORAL DE ESTRUCTURA ====
      console.log("=== INICIO DIAGNÓSTICO BING ===");
      imgElements.each((i, el) => {
        try {
          const $el = $(el);
          const className = $el.attr("class") || "none";
          const altText = $el.attr("alt") || "none";
          const srcAttr = $el.attr("src") || "none";
          const dataSrcAttr = $el.attr("data-src") || "none";
          const dataOriginalAttr = $el.attr("data-original") || "none";
          const srcsetAttr = $el.attr("srcset") ? "present" : "none";
          
          const parentA = $el.closest("a");
          const parentHref = parentA.length > 0 ? (parentA.attr("href") || "empty") : "no-parent-a";

          const dataAttrs: string[] = [];
          if (el.attribs) {
            for (const key of Object.keys(el.attribs)) {
              if (key.startsWith("data-") && !["data-src", "data-original"].includes(key)) {
                let val = el.attribs[key];
                if (val.length > 80) val = val.substring(0, 40) + "...[TRUNCATED]";
                dataAttrs.push(`${key}=${val}`);
              }
            }
          }

          console.log(`[IMG #${i}] class: ${className}`);
          console.log(`[IMG #${i}] alt: ${altText.substring(0, 50)}`);
          
          // Helper to safely log URL avoiding too much query string data
          const safeUrlLog = (url: string) => {
             if (url === "none") return "none";
             try {
                const p = new URL(url.startsWith("//") ? "https:" + url : (url.startsWith("/") ? "https://bing.com" + url : url));
                return p.origin + p.pathname + "?...";
             } catch(e) {
                return url.substring(0, 80) + (url.length > 80 ? "..." : "");
             }
          };

          console.log(`[IMG #${i}] src: ${safeUrlLog(srcAttr)}`);
          console.log(`[IMG #${i}] data-src: ${safeUrlLog(dataSrcAttr)}`);
          console.log(`[IMG #${i}] data-original: ${safeUrlLog(dataOriginalAttr)}`);
          console.log(`[IMG #${i}] srcset: ${srcsetAttr}`);
          console.log(`[IMG #${i}] parent a.href: ${safeUrlLog(parentHref)}`);
          if (dataAttrs.length > 0) console.log(`[IMG #${i}] other-data: ${dataAttrs.join(", ")}`);

          const rawUrl = dataSrcAttr !== "none" ? dataSrcAttr : (srcAttr !== "none" ? srcAttr : "");
          const exists = !!rawUrl;
          const isHttps = rawUrl.startsWith("https://");
          const isValid = isValidImageUrl(rawUrl);
          const isThumbnail = rawUrl.includes(".bing.net");
          const originalCandidate = parentHref !== "no-parent-a" && parentHref !== "empty" && parentHref.startsWith("http") && !parentHref.includes("bing.com");

          console.log(`[IMG #${i}] EVAL -> exists:${exists} | isHttps:${isHttps} | isValid:${isValid} | isThumb:${isThumbnail} | hasOriginalParent:${originalCandidate}`);
        } catch (e) {
          console.log(`[IMG #${i}] Error parsing diagnostics`);
        }
      });
      console.log("=== FIN DIAGNÓSTICO BING ===");
      // ===========================================

      imgElements.each((_, el) => {
        if (results.length >= 5) return;
        
        let src = $(el).attr("data-src") || $(el).attr("src") || "";
        let alt = $(el).attr("alt") || "";
        
        if (src && isValidImageUrl(src)) {
          beforeFilter++;
          // Intentar obtener una URL original de mayor resolución si está en un wrapper
          const parentA = $(el).closest("a");
          let originalUrl = parentA.attr("href");
          
          let finalUrl = src;
          if (originalUrl && originalUrl.startsWith("http") && !originalUrl.includes("bing.com") && isValidImageUrl(originalUrl) && /\.(jpg|jpeg|png|webp)/i.test(originalUrl)) {
            finalUrl = originalUrl;
          }

          if (esRelevante(query, alt)) {
            if (!results.some(r => r.url === finalUrl)) {
              results.push({ url: finalUrl, source: 'Bing (Fallback)', title: alt });
            }
          } else {
            discardedByRelevance++;
          }
        }
      });
    }
    
    console.log(`[BING] Selector utilizado: ${selectorUtilizado}`);
    console.log(`[BING] Resultados URL válidas antes de relevancia: ${beforeFilter}`);
    console.log(`[BING] Descartados por relevancia: ${discardedByRelevance}`);
    console.log(`[BING] Cantidad final: ${results.length}`);
    return { results: results.slice(0, 5) };
  } catch (err: any) {
    if (err.name === 'AbortError') return { error: "TIMEOUT" };
    return { error: `ERROR_FALLBACK_${err.message?.substring(0, 40)}` };
  }
}

// Lógica para validar que el usuario es un Empleado con permisos
async function verifyProductsUpdatePermission(authHeader: string | null): Promise<{ authorized: boolean, error?: string, status?: number }> {
  if (!authHeader) {
    return { authorized: false, error: 'Missing Authorization header', status: 401 };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    // Si no estamos en entorno de Supabase (o fallaron vars), rechazamos por seguridad.
    console.error("Missing Supabase environment variables");
    return { authorized: false, error: 'Internal configuration error', status: 500 };
  }

  // Creamos el cliente CON EL CONTEXTO DEL USUARIO usando su propio JWT
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  // Validamos JWT nativamente contra Supabase Auth
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { authorized: false, error: 'Invalid JWT or user not found', status: 401 };
  }

  // Obtenemos su perfil de empleado usando RLS de 'employees' usando su propia sesión
  const { data: employee, error: empError } = await supabase
    .from('employees')
    .select('role, permissions_override')
    .eq('user_id', user.id)
    .single();

  if (empError || !employee) {
    return { authorized: false, error: 'User is not an employee', status: 403 };
  }

  // Replicamos la lógica estricta de `employees.service.ts` y `permissions.ts`
  const role = employee.role;
  const overrides = employee.permissions_override;
  const targetPermission = 'products.update'; // Permiso exacto exigido

  const basePermissions = new Set<string>();
  
  // En La Martina, TODOS los roles base (super_admin, owner, admin, employee)
  // incluyen 'products.update' por defecto en ROLE_PERMISSIONS
  if (['super_admin', 'owner', 'admin', 'employee'].includes(role)) {
    basePermissions.add(targetPermission);
  }

  // Aplicamos overrides si existen (allow / deny)
  if (overrides) {
    if (Array.isArray(overrides.allow)) {
      overrides.allow.forEach((p: string) => basePermissions.add(p));
    }
    if (Array.isArray(overrides.deny)) {
      overrides.deny.forEach((p: string) => basePermissions.delete(p));
    }
  }

  if (basePermissions.has(targetPermission)) {
    return { authorized: true };
  } else {
    return { authorized: false, error: 'Insufficient permissions', status: 403 };
  }
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Verificación Estricta de Identidad y Rol (Replicando RBAC de La Martina)
    const authHeader = req.headers.get('Authorization');
    const authCheck = await verifyProductsUpdatePermission(authHeader);
    
    if (!authCheck.authorized) {
      console.warn("Authorization failed:", authCheck.error);
      return new Response(
        JSON.stringify({ error: 'Acceso denegado.' }), // No exponemos detalles al cliente
        { status: authCheck.status || 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Validación y seguridad del payload
    const { query } = await req.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Query inválida o vacía.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (query.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Query demasiado larga (max 100 caracteres).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanQuery = query.trim();
    let allResults: any[] = [];
    
    // 3. Flujo principal
    const mlSearch = await searchMercadoLibre(cleanQuery);
    if (mlSearch.results && mlSearch.results.length > 0) {
      allResults = mlSearch.results;
    } else {
      console.log(`[MAIN] ML no devolvió resultados (Error: ${mlSearch.error || '0 items'}). Activando Bing...`);
      const bingSearch = await searchBing(cleanQuery);
      if (bingSearch.results && bingSearch.results.length > 0) {
        allResults = bingSearch.results;
      }
    }

    return new Response(
      JSON.stringify({ images: allResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error("Internal error:", error);
    return new Response(
      JSON.stringify({ error: 'Fallo interno en la búsqueda.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
