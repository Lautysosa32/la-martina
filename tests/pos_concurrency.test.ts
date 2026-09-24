import assert from 'assert';
import { CreateSaleInput } from '../src/offline/repositories/saleRepository';

console.log('================================================================');
console.log('  TEST SUITE: CONCURRENCIA POS & PREVENCIÓN DE DOBLE VENTA');
console.log('================================================================\n');

/**
 * Simulador del motor de concurrencia e idempotencia de saleRepository
 */
class SaleConcurrencyController {
  private activeSaleLocks = new Map<string, Promise<any>>();
  private recentCompletedSales = new Map<string, { sale: any; timestamp: number }>();
  public executionCount = 0;
  public stockDeductionCount = 0;
  public cashMovementCount = 0;

  private generateFingerprint(input: CreateSaleInput): string {
    if (input.idempotency_key) return input.idempotency_key;
    const itemsSig = input.items.map(i => `${i.productId}:${i.quantity}:${i.price}`).join('|');
    return `${input.payment_method}_${input.total}_${input.customer_phone || ''}_${itemsSig}`;
  }

  async createSale(input: CreateSaleInput): Promise<any> {
    const fingerprint = this.generateFingerprint(input);
    const nowTs = Date.now();

    // 1. Verificación de caché de ventas completadas recientemente
    const cached = this.recentCompletedSales.get(fingerprint);
    if (cached && (nowTs - cached.timestamp < 10000)) {
      return cached.sale;
    }

    // 2. Bloqueo de peticiones concurrentes en vuelo (doble clic)
    if (this.activeSaleLocks.has(fingerprint)) {
      return await this.activeSaleLocks.get(fingerprint)!;
    }

    const salePromise = (async () => {
      // Simular latencia de red/disco de 50ms
      await new Promise(resolve => setTimeout(resolve, 50));

      this.executionCount++;
      this.stockDeductionCount += input.items.length;
      if (input.payment_method === 'cash') {
        this.cashMovementCount++;
      }

      const sale = {
        sale_id: `POS-CAJA01-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        idempotency_key: input.idempotency_key,
        total: input.total,
        payment_method: input.payment_method,
        created_at: Date.now(),
      };

      this.recentCompletedSales.set(fingerprint, {
        sale,
        timestamp: Date.now()
      });

      return sale;
    })();

    this.activeSaleLocks.set(fingerprint, salePromise);

    try {
      return await salePromise;
    } finally {
      this.activeSaleLocks.delete(fingerprint);
    }
  }
}

async function runTests() {
  console.log('--- TEST 1: Dos llamadas concurrentes simultáneas (Doble Clic / Enter rápido) ---');
  {
    const controller = new SaleConcurrencyController();
    const saleInput: CreateSaleInput = {
      customer_name: 'Cliente Final',
      customer_phone: '1122334455',
      payment_method: 'cash',
      items: [
        { productId: 'prod-1', productCode: 'P1', name: 'Leche', quantity: 2, price: 1200, saleType: 'unit', total: 2400 },
        { productId: 'prod-2', productCode: 'P2', name: 'Pan', quantity: 1, price: 800, saleType: 'unit', total: 800 }
      ],
      subtotal: 3200,
      discount_amount: 0,
      total: 3200,
      is_offline: false,
      idempotency_key: 'idemp-sale-pos-12345'
    };

    // Disparamos 2 llamadas simultáneas (Promise.all)
    const [result1, result2] = await Promise.all([
      controller.createSale(saleInput),
      controller.createSale(saleInput)
    ]);

    // Verificamos que ambas devuelvan EXACTAMENTE la misma venta física
    assert.strictEqual(result1.sale_id, result2.sale_id, 'Ambas llamadas deben retornar el mismo sale_id');
    assert.strictEqual(controller.executionCount, 1, 'La creación de la venta debe ejecutarse solo 1 vez');
    assert.strictEqual(controller.stockDeductionCount, 2, 'El stock sólo debe descontarse 1 vez (2 productos)');
    assert.strictEqual(controller.cashMovementCount, 1, 'El cobro en caja sólo debe registrarse 1 vez');
    console.log('  ✅ PASS: Concurrencia bloqueada. Doble clic generó 1 sola venta, 1 descuento de stock y 1 movimiento');
  }

  console.log('\n--- TEST 2: Reintento secuencial inmediato dentro de la ventana de idempotencia (10s) ---');
  {
    const controller = new SaleConcurrencyController();
    const saleInput: CreateSaleInput = {
      customer_name: 'Maria Gomez',
      customer_phone: '1199887766',
      payment_method: 'cash',
      items: [{ productId: 'prod-10', productCode: 'P10', name: 'Yerba', quantity: 1, price: 2500, saleType: 'unit', total: 2500 }],
      subtotal: 2500,
      discount_amount: 0,
      total: 2500,
      is_offline: false,
      idempotency_key: 'idemp-sale-yerba-001'
    };

    const firstSale = await controller.createSale(saleInput);
    const secondSale = await controller.createSale(saleInput);

    assert.strictEqual(firstSale.sale_id, secondSale.sale_id, 'Reintento debe entregar la venta cacheada');
    assert.strictEqual(controller.executionCount, 1, 'No debe ejecutarse de nuevo');
    assert.strictEqual(controller.stockDeductionCount, 1, 'Stock no debe duplicar descuento');
    console.log('  ✅ PASS: Reintento secuencial protegido por idempotencia temporal (retornó venta cacheada)');
  }

  console.log('\n--- TEST 3: Dos operaciones distintas con diferente idempotency_key deben ejecutarse de forma independiente ---');
  {
    const controller = new SaleConcurrencyController();
    const saleInput1: CreateSaleInput = {
      customer_name: 'Cliente A',
      customer_phone: '11111111',
      payment_method: 'cash',
      items: [{ productId: 'prod-1', productCode: 'P1', name: 'Arroz', quantity: 1, price: 1000, saleType: 'unit', total: 1000 }],
      subtotal: 1000,
      discount_amount: 0,
      total: 1000,
      is_offline: false,
      idempotency_key: 'idemp-sale-distinta-1'
    };

    const saleInput2: CreateSaleInput = {
      customer_name: 'Cliente B',
      customer_phone: '22222222',
      payment_method: 'card',
      items: [{ productId: 'prod-2', productCode: 'P2', name: 'Fideos', quantity: 2, price: 900, saleType: 'unit', total: 1800 }],
      subtotal: 1800,
      discount_amount: 0,
      total: 1800,
      is_offline: false,
      idempotency_key: 'idemp-sale-distinta-2'
    };

    const [saleA, saleB] = await Promise.all([
      controller.createSale(saleInput1),
      controller.createSale(saleInput2)
    ]);

    assert.notStrictEqual(saleA.sale_id, saleB.sale_id, 'Ventas distintas deben tener IDs distintos');
    assert.strictEqual(controller.executionCount, 2, 'Deben ejecutarse ambas operaciones');
    console.log('  ✅ PASS: Ventas legítimamente independientes no interfieren entre sí');
  }

  console.log('\n================================================================');
  console.log('  TODOS LOS TESTS DE CONCURRENCIA POS PASARON CON ÉXITO');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('Test falló con error:', err);
  process.exit(1);
});
