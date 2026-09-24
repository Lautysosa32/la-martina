import { 
  InvoiceType, 
  CustomerTaxCondition, 
  VOUCHER_CODES, 
  VAT_CODES, 
  NormalizedInvoiceItem, 
  VatBreakdownEntry 
} from './arcaTypes';

/**
 * Valida un CUIT o CUIL argentino utilizando el algoritmo Módulo 11 oficial de AFIP/ARCA.
 */
export function validateCuit(rawCuit: string): { 
  valid: boolean; 
  formatted: string; 
  clean: string; 
  error?: string; 
} {
  if (!rawCuit) {
    return { valid: false, formatted: '', clean: '', error: 'El CUIT no puede estar vacío.' };
  }

  const clean = rawCuit.replace(/\D/g, '');

  if (clean.length !== 11) {
    return { 
      valid: false, 
      formatted: clean, 
      clean, 
      error: `El CUIT debe contener exactamente 11 dígitos (recibidos: ${clean.length}).` 
    };
  }

  // Prefijos válidos: 20, 23, 24, 27 (personas físicas), 30, 33, 34 (personas jurídicas)
  const validPrefixes = ['20', '23', '24', '27', '30', '33', '34'];
  const prefix = clean.substring(0, 2);
  if (!validPrefixes.includes(prefix)) {
    return { 
      valid: false, 
      formatted: clean, 
      clean, 
      error: `El prefijo del CUIT (${prefix}) no corresponde a un tipo válido.` 
    };
  }

  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;

  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean[i], 10) * multipliers[i];
  }

  const mod = sum % 11;
  let expectedCheckDigit = 11 - mod;
  if (expectedCheckDigit === 11) expectedCheckDigit = 0;
  if (expectedCheckDigit === 10) expectedCheckDigit = 9;

  const actualCheckDigit = parseInt(clean[10], 10);

  if (expectedCheckDigit !== actualCheckDigit) {
    return { 
      valid: false, 
      formatted: clean, 
      clean, 
      error: `Dígito verificador inválido (esperado: ${expectedCheckDigit}, ingresado: ${actualCheckDigit}).` 
    };
  }

  const formatted = `${clean.substring(0, 2)}-${clean.substring(2, 10)}-${clean.substring(10)}`;
  return { valid: true, formatted, clean };
}

/**
 * Determina el tipo de comprobante legal (A, B, C) según las condiciones fiscales de emisor y receptor.
 */
export function determineInvoiceType(
  emitterTaxCondition: string,
  customerTaxCondition: CustomerTaxCondition
): {
  invoiceType: InvoiceType;
  invoiceTypeCode: number;
  reason: string;
} {
  const normEmitter = (emitterTaxCondition || '').trim();

  // Si el emisor es Monotributista o Exento: emite siempre Factura C
  if (normEmitter.toLowerCase().includes('monotribut')) {
    return {
      invoiceType: 'C',
      invoiceTypeCode: VOUCHER_CODES.C,
      reason: 'El emisor es Monotributista: emite Factura C a todos los destinatarios.'
    };
  }

  if (normEmitter.toLowerCase().includes('exento')) {
    return {
      invoiceType: 'C',
      invoiceTypeCode: VOUCHER_CODES.C,
      reason: 'El emisor es Exento: emite Factura C.'
    };
  }

  // Si el emisor es Responsable Inscripto (Régimen General del Supermercado):
  switch (customerTaxCondition) {
    case 'Responsable Inscripto':
      return {
        invoiceType: 'A',
        invoiceTypeCode: VOUCHER_CODES.A,
        reason: 'Responsable Inscripto a Responsable Inscripto: corresponde Factura A con IVA discriminado.'
      };

    case 'Monotributista':
      // Según RG 5003/2021 de AFIP: RI debe emitir Factura A a Monotributistas discriminando IVA
      return {
        invoiceType: 'A',
        invoiceTypeCode: VOUCHER_CODES.A,
        reason: 'Responsable Inscripto a Monotributista: corresponde Factura A (RG 5003/2021).'
      };

    case 'Consumidor Final':
      return {
        invoiceType: 'B',
        invoiceTypeCode: VOUCHER_CODES.B,
        reason: 'Responsable Inscripto a Consumidor Final: corresponde Factura B con IVA incluido.'
      };

    case 'Exento':
      return {
        invoiceType: 'B',
        invoiceTypeCode: VOUCHER_CODES.B,
        reason: 'Responsable Inscripto a Sujeto Exento: corresponde Factura B.'
      };

    case 'No Categorizado':
    default:
      return {
        invoiceType: 'B',
        invoiceTypeCode: VOUCHER_CODES.B,
        reason: 'Responsable Inscripto a No Categorizado: corresponde Factura B.'
      };
  }
}

/**
 * Recalcula de forma rigurosa los ítems, base imponible neta, IVA por alícuota y total.
 * Previene discrepancias de redondeo monetario y asegura consistencia con las reglas de ARCA.
 */
export function recalculateFiscalInvoice(
  rawItems: Array<{
    productId?: string;
    code?: string;
    codigoMtx?: string;
    barcode?: string;
    gtin?: string;
    ean?: string;
    description: string;
    quantity: number;
    unit?: string;
    price: number;
    taxRate?: number;
    discountAmount?: number;
  }>,
  pricesIncludeTax: boolean = true
): {
  subtotalNet: number;
  taxes: number;
  total: number;
  items: NormalizedInvoiceItem[];
  vatBreakdown: VatBreakdownEntry[];
} {
  const round2 = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

  let totalNet = 0;
  let totalTax = 0;
  let grandTotal = 0;

  const vatGroups: Record<number, { base: number; tax: number }> = {};

  const normalizedItems: NormalizedInvoiceItem[] = rawItems.map(raw => {
    const qty = Math.max(0, Number(raw.quantity) || 0);
    const price = Math.max(0, Number(raw.price) || 0);
    const vatRate = Number(raw.taxRate ?? 21); // Default 21%

    let lineTotal = 0;
    let netAmount = 0;
    let vatAmount = 0;
    let unitPrice = 0;

    if (pricesIncludeTax) {
      lineTotal = round2(qty * price);
      netAmount = round2(lineTotal / (1 + vatRate / 100));
      vatAmount = round2(lineTotal - netAmount);
      unitPrice = round2(price / (1 + vatRate / 100));
    } else {
      netAmount = round2(qty * price);
      vatAmount = round2(netAmount * (vatRate / 100));
      lineTotal = round2(netAmount + vatAmount);
      unitPrice = round2(price);
    }

    totalNet += netAmount;
    totalTax += vatAmount;
    grandTotal += lineTotal;

    if (!vatGroups[vatRate]) {
      vatGroups[vatRate] = { base: 0, tax: 0 };
    }
    vatGroups[vatRate].base += netAmount;
    vatGroups[vatRate].tax += vatAmount;

    const mtxCode = (raw.codigoMtx || raw.barcode || raw.gtin || raw.ean || '').trim();

    return {
      productId: raw.productId,
      code: raw.code || raw.productId || 'GEN',
      codigoMtx: mtxCode || undefined,
      barcode: raw.barcode || undefined,
      gtin: raw.gtin || undefined,
      ean: raw.ean || undefined,
      description: raw.description.trim(),
      quantity: qty,
      unit: raw.unit || 'unidades',
      unitPrice,
      price: raw.price,
      taxRate: vatRate,
      netAmount,
      vatRate,
      vatAmount,
      discountAmount: raw.discountAmount || 0,
      total: lineTotal
    };
  });

  const vatBreakdown: VatBreakdownEntry[] = Object.entries(vatGroups).map(([rateStr, group]) => {
    const rate = parseFloat(rateStr);
    const vatCode = VAT_CODES[rate] || 5; // 5 = 21%
    return {
      vatRate: rate,
      vatCode,
      baseAmount: round2(group.base),
      vatAmount: round2(group.tax)
    };
  });

  return {
    subtotalNet: round2(totalNet),
    taxes: round2(totalTax),
    total: round2(grandTotal),
    items: normalizedItems,
    vatBreakdown
  };
}

/**
 * Límite legal ARCA para ventas a Consumidor Final sin identificar (DNI no obligatorio por debajo de este importe).
 * Superado este monto, la normativa exige DNI o CUIT del receptor.
 */
export const CF_DNI_REQUIRED_LIMIT = 344488;
