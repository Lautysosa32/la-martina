import { Product } from '../data/mockData';

export interface ScaleBarcodeResult {
  isScaleBarcode: boolean;
  product?: Product;
  weightKg?: number;
  priceTotal?: number;
  extractedCode?: string;
  rawCode: string;
}

/**
 * Parsea un código de barras emitido por balanzas comerciales (estándar EAN-13 / GS1 interno).
 * 
 * Estructura común en balanzas (Systel, Kretz, Moretti, Toledo):
 * - Prefijo 2 dígitos: '20', '21', '22'
 * - Código PLU / Producto: 4 a 5 dígitos (ej: '0045' o '00045')
 * - Datos (Peso en gramos o Importe): 5 dígitos (ej: '00850' = 850 gramos = 0.850 kg)
 * - Dígito verificador: 1 dígito
 * 
 * Ejemplo 1 (13 dígitos con 4 dígitos de producto y 5 de peso):
 * "200045008503" -> Prefijo 20, Producto 0045 (o 45), 850g (0.850 kg)
 * 
 * Ejemplo 2 (13 dígitos con 5 dígitos de producto y 5 de peso):
 * "200004500850" (12 dígitos) o "2000045008503"
 */
export function parseScaleBarcode(rawInput: string, products: Product[]): ScaleBarcodeResult {
  const clean = rawInput.trim();
  
  // Validar longitud y prefijo de balanza
  const isCandidate = (clean.length === 12 || clean.length === 13) &&
    (clean.startsWith('20') || clean.startsWith('21') || clean.startsWith('22'));

  if (!isCandidate) {
    return { isScaleBarcode: false, rawCode: clean };
  }

  const prefix = clean.substring(0, 2);

  // Intentamos primero la partición estándar de 4 dígitos para el producto y 5 para el peso
  // 20 [CCCC] [WWWWW] [V]  -> 2 + 4 + 5 + 1 = 12 o 13 chars
  const productCode4 = clean.substring(2, 6); // ej "0045"
  const productCode4Numeric = String(parseInt(productCode4, 10)); // ej "45"
  const weightGrams4 = parseInt(clean.substring(6, 11), 10); // ej 850

  // Intentamos también partición de 5 dígitos para el producto y 5 para el peso si tuviera 13 dígitos
  // 20 [CCCCC] [WWWWW] [V] -> 2 + 5 + 5 + 1 = 13 chars
  const productCode5 = clean.length >= 13 ? clean.substring(2, 7) : '';
  const productCode5Numeric = productCode5 ? String(parseInt(productCode5, 10)) : '';
  const weightGrams5 = clean.length >= 13 ? parseInt(clean.substring(7, 12), 10) : 0;

  // Buscar coincidencia en el catálogo de productos
  let matchedProduct: Product | undefined;
  let finalWeightKg = 0;
  let finalExtractedCode = '';

  // 1. Intentar con código de 4 dígitos
  const match4 = products.find(p => {
    const b = p.barcode ? String(p.barcode).trim() : '';
    const id = p.id ? String(p.id).trim() : '';
    return (
      b === productCode4 ||
      b === productCode4Numeric ||
      id === productCode4 ||
      id === productCode4Numeric ||
      (b.startsWith(prefix) && b.substring(2, 6) === productCode4) ||
      (p.name && (p.name.includes(`[${productCode4}]`) || p.name.includes(`[${productCode4Numeric}]`)))
    );
  });

  if (match4 && !isNaN(weightGrams4) && weightGrams4 > 0) {
    matchedProduct = match4;
    finalWeightKg = parseFloat((weightGrams4 / 1000).toFixed(3));
    finalExtractedCode = productCode4;
  } else if (productCode5) {
    // 2. Intentar con código de 5 dígitos
    const match5 = products.find(p => {
      const b = p.barcode ? String(p.barcode).trim() : '';
      const id = p.id ? String(p.id).trim() : '';
      return (
        b === productCode5 ||
        b === productCode5Numeric ||
        id === productCode5 ||
        id === productCode5Numeric ||
        (b.startsWith(prefix) && b.substring(2, 7) === productCode5)
      );
    });

    if (match5 && !isNaN(weightGrams5) && weightGrams5 > 0) {
      matchedProduct = match5;
      finalWeightKg = parseFloat((weightGrams5 / 1000).toFixed(3));
      finalExtractedCode = productCode5;
    }
  }

  // Si no encontró coincidencia directa por PLU, pero coincide con el barcode base completo cargado en inventario
  if (!matchedProduct) {
    const exactBarcodeMatch = products.find(p => p.barcode && String(p.barcode).trim() === clean);
    if (exactBarcodeMatch && exactBarcodeMatch.saleType === 'weight') {
      return {
        isScaleBarcode: true,
        product: exactBarcodeMatch,
        weightKg: parseFloat((weightGrams4 / 1000).toFixed(3)) || 1,
        extractedCode: productCode4,
        rawCode: clean
      };
    }
  }

  if (matchedProduct) {
    return {
      isScaleBarcode: true,
      product: matchedProduct,
      weightKg: finalWeightKg,
      extractedCode: finalExtractedCode,
      rawCode: clean
    };
  }

  // Es un formato de balanza válido pero el producto específico aún no está registrado
  return {
    isScaleBarcode: true,
    weightKg: parseFloat((weightGrams4 / 1000).toFixed(3)) || 1,
    extractedCode: productCode4,
    rawCode: clean
  };
}
