import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import fs from 'fs';

dotenv.config();

export interface ArcaConfiguration {
  environment: 'testing' | 'production';
  cuit: string;
  certPath: string;
  keyPath: string;
  defaultPointOfSale: number;
  endpoints: {
    wsaa: string;
    wsmtxca: string;
    wsfe: string;
  };
}

const envVal = (process.env.ARCA_ENV || process.env.ARCA_ENVIRONMENT || 'testing').toLowerCase();
const isProduction = envVal === 'production';
const isVercel = Boolean(process.env.VERCEL);

// En Vercel Serverless el sistema de archivos es de solo lectura excepto os.tmpdir()
const baseCertsDir = isVercel
  ? path.join(os.tmpdir(), 'certs')
  : path.resolve(process.cwd(), 'certs');

const certFilename = isProduction ? 'prod.crt' : 'homo.crt';
const keyFilename = isProduction ? 'prod.key' : 'homo.key';
const defaultCertPath = process.env.ARCA_CERT_PATH || (
  fs.existsSync(path.resolve(process.cwd(), `certs/${certFilename}`))
    ? path.resolve(process.cwd(), `certs/${certFilename}`)
    : path.join(baseCertsDir, certFilename)
);
const defaultKeyPath = process.env.ARCA_KEY_PATH || (
  fs.existsSync(path.resolve(process.cwd(), `certs/${keyFilename}`))
    ? path.resolve(process.cwd(), `certs/${keyFilename}`)
    : path.join(baseCertsDir, keyFilename)
);

// Si vienen certificados en variables de entorno (ARCA_CERT_CONTENT / ARCA_KEY_CONTENT),
// materializarlos en baseCertsDir si aún no existen en disco
try {
  if (!fs.existsSync(defaultCertPath) && process.env.ARCA_CERT_CONTENT) {
    if (!fs.existsSync(baseCertsDir)) fs.mkdirSync(baseCertsDir, { recursive: true });
    fs.writeFileSync(defaultCertPath, process.env.ARCA_CERT_CONTENT, 'utf8');
  }
  if (!fs.existsSync(defaultKeyPath) && process.env.ARCA_KEY_CONTENT) {
    if (!fs.existsSync(baseCertsDir)) fs.mkdirSync(baseCertsDir, { recursive: true });
    fs.writeFileSync(defaultKeyPath, process.env.ARCA_KEY_CONTENT, 'utf8');
  }
} catch (e) {
  // Ignorar errores de escritura no bloqueantes
}

export const arcaConfig: ArcaConfiguration = {
  environment: isProduction ? 'production' : 'testing',
  cuit: (process.env.ARCA_CUIT || '').replace(/\D/g, ''),
  certPath: defaultCertPath,
  keyPath: defaultKeyPath,
  defaultPointOfSale: Number(process.env.ARCA_PV || process.env.ARCA_DEFAULT_POINT_OF_SALE || 1),
  endpoints: {
    wsaa: isProduction
      ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
      : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsmtxca: isProduction
      ? 'https://serviciosjava.afip.gob.ar/wsmtxca/services/MTXCAService'
      : 'https://fwshomo.afip.gov.ar/wsmtxca/services/MTXCAService',
    wsfe: isProduction
      ? 'https://servicios1.afip.gob.ar/wsfev1/service.asmx'
      : 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  }
};

/**
 * Retorna una copia de la configuración segura para ser enviada al frontend o logs.
 * NUNCA incluye rutas internas de certificados ni claves privadas.
 */
export function getSafeFiscalConfig(): {
  environment: 'testing' | 'production';
  cuit: string;
  defaultPointOfSale: number;
} {
  return {
    environment: arcaConfig.environment,
    cuit: arcaConfig.cuit,
    defaultPointOfSale: arcaConfig.defaultPointOfSale
  };
}
