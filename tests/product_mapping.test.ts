import { resolveBillingProduct, buildCreatorItemsFromOrders } from '../src/utils/billingProductMapper';
import { recalculateFiscalInvoice } from '../server/services/arca/arcaTaxRules';

async function runMappingTests() {
  console.log('================================================================');
  console.log('  TEST SUITE: MAPEO DE PRODUCTOS PARA FACTURACIÓN ELECTRÓNICA');
  console.log('  (Verificación de Prioridad, Resguardo Fiscal y WSMTXCA)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `-> ${detail}` : ''}`);
      failed++;
    }
  }

  // Catálogo de prueba basado en datos reales de Supabase
  const testCatalog = [
    {
      id: '024b4bf2-9400-4447-b370-9e9443aec1ed',
      name: 'Lentejas X400',
      barcode: '7791476034011',
      sale_type: 'unit'
    },
    {
      id: 'prod-sin-barcode-001',
      name: 'Pan Casero Artesanal',
      barcode: null,
      sale_type: 'weight'
    },
    {
      id: 'prod-normal-101',
      name: 'Arroz Gallo Oro 1kg',
      barcode: '7790070412345',
      sale_type: 'unit'
    }
  ];

  // ─── CASO 1: order_item GENERIC + name igual a products.barcode ─────────────
  console.log('--- CASO 1: order_item GENERIC + name con código de barras ---');
  const genericBarcodeItem = {
    id: 'GENERIC',
    productId: 'GENERIC',
    name: '7791476034011',
    price: 1750,
    quantity: 10
  };

  const resCaso1 = resolveBillingProduct(genericBarcodeItem, testCatalog);
  assert(resCaso1.matched === true, 'Caso 1: Resuelve contra el catálogo exitosamente');
  assert(resCaso1.resolvedItem.description === 'Lentejas X400', 'Caso 1: description es el nombre real del producto ("Lentejas X400")');
  assert(resCaso1.resolvedItem.barcode === '7791476034011', 'Caso 1: barcode es "7791476034011"');
  assert(resCaso1.resolvedItem.codigoMtx === '7791476034011', 'Caso 1: codigoMtx es "7791476034011"');
  assert(resCaso1.resolvedItem.code === '024b4bf2-9400-4447-b370-9e9443aec1ed', 'Caso 1: code es el ID interno del catálogo');

  // ─── CASO 2: producto sin barcode => bloquea autorización ──────────────────
  console.log('\n--- CASO 2: Producto sin barcode en catálogo ---');
  const itemSinBarcode = {
    id: 'prod-sin-barcode-001',
    productId: 'prod-sin-barcode-001',
    name: 'Pan Casero Artesanal',
    price: 800,
    quantity: 1.5,
    saleType: 'weight'
  };

  const resCaso2 = resolveBillingProduct(itemSinBarcode, testCatalog);
  assert(resCaso2.resolvedItem.barcode === undefined, 'Caso 2: barcode es undefined');
  assert(resCaso2.resolvedItem.codigoMtx === undefined, 'Caso 2: codigoMtx es undefined');

  // Validación preventiva idéntica a Billing.tsx L379
  const creatorItemsCaso2 = [resCaso2.resolvedItem];
  const itemWithoutFiscalCode = creatorItemsCaso2.find(i => !(i.codigoMtx || i.barcode || i.gtin || i.ean || '').trim());
  assert(Boolean(itemWithoutFiscalCode), 'Caso 2: Se detecta ítem sin dato fiscal');
  assert(itemWithoutFiscalCode?.description === 'Pan Casero Artesanal', 'Caso 2: Bloquea autorización preventivamente para "Pan Casero Artesanal"');

  // ─── CASO 3: producto normal con product_id => utiliza products.barcode ─────
  console.log('\n--- CASO 3: Producto normal con product_id válido ---');
  const itemNormal = {
    id: 'prod-normal-101',
    productId: 'prod-normal-101',
    name: 'Arroz Gallo Oro',
    price: 2100,
    quantity: 3
  };

  const resCaso3 = resolveBillingProduct(itemNormal, testCatalog);
  assert(resCaso3.matched === true, 'Caso 3: Encuentra producto por product_id');
  assert(resCaso3.resolvedItem.description === 'Arroz Gallo Oro 1kg', 'Caso 3: description es el nombre oficial del catálogo');
  assert(resCaso3.resolvedItem.barcode === '7790070412345', 'Caso 3: barcode es "7790070412345"');
  assert(resCaso3.resolvedItem.codigoMtx === '7790070412345', 'Caso 3: codigoMtx es "7790070412345"');
  assert(resCaso3.resolvedItem.code === 'prod-normal-101', 'Caso 3: code es "prod-normal-101"');

  // ─── CASO 4: description no contiene el barcode cuando existe products.name ──
  console.log('\n--- CASO 4: description no contiene el barcode ---');
  assert(resCaso1.resolvedItem.description !== '7791476034011', 'Caso 4: description NO es el barcode');
  assert(!resCaso1.resolvedItem.description.includes('7791476034011'), 'Caso 4: description no contiene los dígitos del barcode');
  assert(resCaso1.resolvedItem.description === 'Lentejas X400', 'Caso 4: description contiene únicamente el nombre del producto');

  // ─── CASO 5: Consolidación de múltiples órdenes (buildCreatorItemsFromOrders) ──
  console.log('\n--- CASO 5: Consolidación de ítems en buildCreatorItemsFromOrders ---');
  const mockOrders = [
    {
      items: [
        { id: 'GENERIC', name: '7791476034011', price: 1740, quantity: 2 },
        { id: '024b4bf2-9400-4447-b370-9e9443aec1ed', name: 'Lentejas X400', price: 1740, quantity: 3 }
      ]
    }
  ];

  const consolidated = buildCreatorItemsFromOrders(mockOrders, testCatalog);
  assert(consolidated.length === 1, 'Caso 5: Los dos ítems del mismo producto se consolidan en una sola línea');
  assert(consolidated[0].quantity === 5, 'Caso 5: La cantidad consolidada es 5');
  assert(consolidated[0].description === 'Lentejas X400', 'Caso 5: La descripción consolidada es "Lentejas X400"');
  assert(consolidated[0].codigoMtx === '7791476034011', 'Caso 5: El codigoMtx consolidado es "7791476034011"');

  // ─── CASO 6: Verificación de contrato con backend fiscal (recalculateFiscalInvoice)
  console.log('\n--- CASO 6: Contrato con backend recalculateFiscalInvoice ---');
  const fiscalRecalc = recalculateFiscalInvoice(consolidated, true);
  const fiscalItem = fiscalRecalc.items[0];
  assert(fiscalItem.codigoMtx === '7791476034011', 'Caso 6: recalculateFiscalInvoice preserva codigoMtx="7791476034011"');
  assert(fiscalItem.description === 'Lentejas X400', 'Caso 6: recalculateFiscalInvoice preserva description="Lentejas X400"');
  assert(fiscalItem.code === '024b4bf2-9400-4447-b370-9e9443aec1ed', 'Caso 6: recalculateFiscalInvoice preserva code');

  console.log('\n================================================================');
  console.log(`  RESUMEN: ${passed} pasadas, ${failed} fallidas`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMappingTests().catch(err => {
  console.error('Error fatal en tests:', err);
  process.exit(1);
});
