import dotenv from 'dotenv';
import path from 'path';

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

export const arcaConfig: ArcaConfiguration = {
  environment: isProduction ? 'production' : 'testing',
  cuit: (process.env.ARCA_CUIT || '').replace(/\D/g, ''),
  certPath: process.env.ARCA_CERT_PATH || path.resolve(process.cwd(), isProduction ? 'certs/prod.crt' : 'certs/homo.crt'),
  keyPath: process.env.ARCA_KEY_PATH || path.resolve(process.cwd(), isProduction ? 'certs/prod.key' : 'certs/homo.key'),
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
