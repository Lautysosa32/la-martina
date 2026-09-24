import type { InvoiceItem } from '../context/AdminContext';

export interface RawOrderItemInput {
  id?: string;
  productId?: string;
  name: string;
  price: number;
  quantity: number;
  saleType?: 'unit' | 'weight' | string;
  barcode?: string;
  codigoMtx?: string;
  gtin?: string;
  ean?: string;
  code?: string;
}

export interface CatalogProductLookup {
  id: string;
  name: string;
  barcode?: string | null;
  saleType?: string;
  sale_type?: string;
}

/**
 * Resuelve un ítem de venta contra el catálogo de productos usando la prioridad estricta:
 * 1. product_id válido distinto de GENERIC
 * 2. products.barcode coincidente con item.name
 * 3. products.barcode coincidente con item.id
 * 4. nombre exacto del producto (case-insensitive)
 *
 * Una vez encontrado el producto:
 * - description = products.name
 * - barcode = products.barcode
 * - codigoMtx = products.barcode
 * - gtin = products.barcode
 * - ean = products.barcode
 * - code = products.id
 *
 * Si NO se encuentra coincidencia real en catálogo:
 * - mantener barcode/codigoMtx vacío (undefined)
 * - NO aceptar automáticamente números como código fiscal
 * - mostrar "Sin código fiscal MTX" y bloquear la autorización
 */
export function resolveBillingProduct(
  item: RawOrderItemInput,
  catalogProducts: CatalogProductLookup[]
): {
  key: string;
  resolvedItem: InvoiceItem;
  matched: boolean;
} {
  const rawId = (item.productId || item.id || '').trim();
  const rawName = (item.name || '').trim();

  let matchedProduct: CatalogProductLookup | undefined;

  // 1. product_id válido distinto de GENERIC
  if (rawId && rawId.toUpperCase() !== 'GENERIC' && !rawId.toUpperCase().startsWith('GEN-') && !rawId.toUpperCase().startsWith('GEN_')) {
    matchedProduct = catalogProducts.find(p => p.id === rawId);
  }

  // 2. products.barcode coincidente con item.name
  if (!matchedProduct && rawName) {
    matchedProduct = catalogProducts.find(p => p.barcode && p.barcode.trim() === rawName);
  }

  // 3. products.barcode coincidente con item.id
  if (!matchedProduct && rawId) {
    matchedProduct = catalogProducts.find(p => p.barcode && p.barcode.trim() === rawId);
  }

  // 4. nombre exacto del producto (case-insensitive)
  if (!matchedProduct && rawName) {
    matchedProduct = catalogProducts.find(p => p.name && p.name.trim().toLowerCase() === rawName.toLowerCase());
  }

  // Si encontramos coincidencia real en el catálogo
  if (matchedProduct) {
    const fiscalBarcode = (matchedProduct.barcode || '').trim() || undefined;
    const unit = (matchedProduct.saleType || matchedProduct.sale_type || item.saleType) === 'weight' ? 'kg' : 'unidades';

    return {
      key: matchedProduct.id,
      matched: true,
      resolvedItem: {
        productId: matchedProduct.id,
        code: matchedProduct.id,
        description: matchedProduct.name,
        quantity: item.quantity,
        unit,
        price: item.price,
        taxRate: 21,
        total: item.quantity * item.price,
        barcode: fiscalBarcode,
        codigoMtx: fiscalBarcode,
        gtin: fiscalBarcode,
        ean: fiscalBarcode
      }
    };
  }

  // Si NO se encuentra coincidencia en catálogo:
  // mantener barcode y codigoMtx como undefined (nunca inventar códigos)
  const fallbackCode = (rawId && rawId.toUpperCase() !== 'GENERIC') ? rawId : undefined;
  const unit = item.saleType === 'weight' ? 'kg' : 'unidades';

  return {
    key: item.id || item.name,
    matched: false,
    resolvedItem: {
      productId: item.id || item.productId,
      code: fallbackCode,
      description: rawName,
      quantity: item.quantity,
      unit,
      price: item.price,
      taxRate: 21,
      total: item.quantity * item.price,
      barcode: undefined,
      codigoMtx: undefined,
      gtin: undefined,
      ean: undefined
    }
  };
}

/**
 * Consolida y agrupa los ítems de las ventas seleccionadas para el creador de facturas.
 */
export function buildCreatorItemsFromOrders(
  selectedOrders: Array<{ items: RawOrderItemInput[] }>,
  catalogProducts: CatalogProductLookup[]
): InvoiceItem[] {
  const aggregatedItems: Record<string, InvoiceItem> = {};

  selectedOrders.forEach(order => {
    (order.items || []).forEach(item => {
      const { key, resolvedItem } = resolveBillingProduct(item, catalogProducts);

      if (aggregatedItems[key]) {
        aggregatedItems[key].quantity += resolvedItem.quantity;
        aggregatedItems[key].total = aggregatedItems[key].quantity * aggregatedItems[key].price;
        if (!aggregatedItems[key].barcode && resolvedItem.barcode) {
          aggregatedItems[key].barcode = resolvedItem.barcode;
          aggregatedItems[key].codigoMtx = resolvedItem.codigoMtx;
          aggregatedItems[key].gtin = resolvedItem.gtin;
          aggregatedItems[key].ean = resolvedItem.ean;
        }
      } else {
        aggregatedItems[key] = { ...resolvedItem };
      }
    });
  });

  return Object.values(aggregatedItems);
}
