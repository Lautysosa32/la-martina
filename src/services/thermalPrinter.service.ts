import axios from 'axios';
import qz from 'qz-tray';

export interface ThermalPrinterConfig {
  enabled: boolean;
  printerName: string;
  paperWidth: 80 | 58;
  autoPrint: boolean;
  cutPaper: boolean;
  connectionType: 'qz-tray' | 'local-bridge' | 'auto';
}

export const DEFAULT_THERMAL_CONFIG: ThermalPrinterConfig = {
  enabled: true,
  printerName: '',
  paperWidth: 80,
  autoPrint: true,
  cutPaper: true,
  connectionType: 'auto'
};

const STORAGE_KEY = 'la_martina_thermal_printer_config';

export interface PrintResult {
  success: boolean;
  method: 'qz-tray' | 'local-bridge';
  printer: string;
  error?: string;
}

class ThermalPrinterService {
  private isQzConnected = false;

  constructor() {
    // Inicialización pasiva
  }

  /**
   * Obtiene la configuración de la impresora térmica
   */
  getConfig(): ThermalPrinterConfig {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_THERMAL_CONFIG, ...JSON.parse(stored) };
      }
    } catch {}
    return { ...DEFAULT_THERMAL_CONFIG };
  }

  /**
   * Guarda la configuración de la impresora térmica
   */
  saveConfig(updates: Partial<ThermalPrinterConfig>): ThermalPrinterConfig {
    const current = this.getConfig();
    const merged = { ...current, ...updates };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {}
    return merged;
  }

  /**
   * Conecta con QZ Tray mediante WebSocket local si no está conectado aún
   */
  async connectQz(): Promise<boolean> {
    if (this.isQzConnected && qz.websocket.isActive()) {
      return true;
    }

    try {
      if (!qz.websocket.isActive()) {
        await qz.websocket.connect({ retries: 1, delay: 0.5 });
      }
      this.isQzConnected = true;
      return true;
    } catch (err: any) {
      this.isQzConnected = false;
      return false;
    }
  }

  /**
   * Obtiene la lista de impresoras disponibles mediante QZ Tray o la API local
   */
  async listPrinters(): Promise<{ name: string; source: 'qz-tray' | 'local-bridge' }[]> {
    const printers: { name: string; source: 'qz-tray' | 'local-bridge' }[] = [];

    // 1. Intentar con QZ Tray
    try {
      const qzOk = await this.connectQz();
      if (qzOk) {
        const qzList: string[] = await qz.printers.find();
        qzList.forEach(name => printers.push({ name, source: 'qz-tray' }));
        if (printers.length > 0) return printers;
      }
    } catch {}

    // 2. Fallback a API local Express (/api/printer/printers)
    try {
      const res = await axios.get('/api/printer/printers', { timeout: 3000 });
      if (res.data && res.data.printers) {
        res.data.printers.forEach((p: any) => {
          if (p.name && !printers.some(existing => existing.name === p.name)) {
            printers.push({ name: p.name, source: 'local-bridge' });
          }
        });
      }
    } catch {}

    return printers;
  }

  /**
   * Genera el contenido formateado para ticket térmico ESC/POS y texto plano
   */
  formatTicketText(invoice: any, paperWidth: 80 | 58 = 80, emitterConfig?: any): string {
    const charsPerLine = paperWidth === 58 ? 32 : 44;
    const divider = '-'.repeat(charsPerLine);
    const doubleDivider = '='.repeat(charsPerLine);

    const padRow = (left: string, right: string) => {
      const space = charsPerLine - left.length - right.length;
      if (space <= 0) return `${left} ${right}`;
      return left + ' '.repeat(space) + right;
    };

    const center = (text: string) => {
      if (text.length >= charsPerLine) return text;
      const leftPad = Math.floor((charsPerLine - text.length) / 2);
      return ' '.repeat(leftPad) + text;
    };

    const fmtNum = (n: number) =>
      Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const lines: string[] = [];

    // Tipo y Número de Comprobante
    const pv = String(invoice.pointOfSale || 1).padStart(4, '0');
    const cbte = String(invoice.invoiceNumber || 1).padStart(8, '0');
    const tipo = String(invoice.type || invoice.invoiceType || 'B').toUpperCase();
    const cbteCode = tipo === 'A' ? 'Cod 01' : tipo === 'C' ? 'Cod 11' : tipo === 'M' ? 'Cod 51' : 'Cod 06';

    // Fecha y Hora
    let dateStr = '';
    let timeStr = '';
    if (invoice.date) {
      try {
        const d = new Date(invoice.date);
        if (!isNaN(d.getTime())) {
          dateStr = d.toLocaleDateString('es-AR');
          timeStr = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        }
      } catch {}
    }
    if (!dateStr) {
      const now = new Date();
      dateStr = now.toLocaleDateString('es-AR');
      timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    }

    // Encabezado alineado a Factura Física Real
    const fantasy = (emitterConfig?.fantasyName || 'LA MARTINA SUPERMERCADO').toUpperCase();
    const legalName = emitterConfig?.businessName || 'MARTINA SUPERMERCADO S.R.L.';
    const cuit = invoice.emitterCuit || emitterConfig?.cuit || '30-71850123-4';
    const iva = emitterConfig?.taxCondition === 'Responsable Inscripto' ? 'IVA: RI' : `IVA: ${emitterConfig?.taxCondition || 'RI'}`;
    const iibb = emitterConfig?.grossIncome || '750953';
    const fecInicio = emitterConfig?.startDate || '01/10/2015';
    const addr = emitterConfig?.fiscalAddress || 'Av. Libertador 1234';
    const cp = emitterConfig?.postalCode ? `CP(${emitterConfig.postalCode}) SAN LUIS` : 'CP(5700) SAN LUIS';
    const phone = emitterConfig?.phone || '(0266) 442-1234';

    lines.push(center(`FACTURA ${tipo} ${pv}-${cbte}`));
    lines.push(padRow(`${cbteCode} (ORIGINAL)`, `${dateStr} ${timeStr}`));
    lines.push(fantasy);
    lines.push(`De: ${legalName}`);
    lines.push(padRow(`CUIT: ${cuit}`, iva));
    lines.push(padRow(`Ing.Br: ${iibb}`, `Fec.I.Act: ${fecInicio}`));
    lines.push(addr);
    lines.push(cp);
    if (phone) lines.push(`Tel: ${phone}`);
    lines.push(divider);

    // Datos del Cliente Receptor
    const clientName = (invoice.customerName || invoice.clientName || 'Consumidor Final').toUpperCase();
    const docNum = (invoice.customerDocumentNumber || invoice.clientCuit || '').replace(/\D/g, '');
    const taxCond = (invoice.customerTaxCondition || 'CONSUMIDOR FINAL').toUpperCase();

    if (taxCond.includes('CONSUMIDOR FINAL')) {
      lines.push('A CONSUMIDOR FINAL');
      if (docNum && docNum !== '0') {
        lines.push(`DNI: ${docNum}`);
      }
    } else {
      lines.push(`CLIENTE: ${clientName}`);
      lines.push(`CUIT/DNI: ${docNum || 'S/D'}`);
      lines.push(`COND. IVA: ${taxCond}`);
    }
    lines.push(divider);

    // Detalle de Productos
    lines.push(padRow('DESCRIPCION', 'TOTAL'));
    lines.push(divider);

    const items: any[] = invoice.items || [];
    items.forEach(item => {
      const desc = (item.description || item.name || 'PRODUCTO').toUpperCase();
      lines.push(desc);

      const qty = Number(item.quantity || 1);
      const price = Number(item.price || (item.total / qty));
      const tot = Number(item.total || (qty * price));
      const leftCol = `  ${qty} x $${fmtNum(price)}`;
      const rightCol = `$${fmtNum(tot)}`;
      lines.push(padRow(leftCol, rightCol));
    });

    lines.push(divider);

    // Totales
    const total = Number(invoice.total ?? 0);
    const subtotal = Number(invoice.subtotalNet ?? invoice.subtotal ?? (total / 1.21));
    const discountAmount = Number(invoice.discountAmount || 0);
    const ivaContenido = Math.max(0, total - subtotal);

    lines.push(padRow('Subtotal:', `$ ${fmtNum(subtotal)}`));
    lines.push(padRow('Desc/Rec:', discountAmount > 0 ? `-$ ${fmtNum(discountAmount)}` : '$ 0,00'));
    lines.push(doubleDivider);
    lines.push(padRow('TOTAL:', `$ ${fmtNum(total)}`));
    lines.push(doubleDivider);

    // Medio de Pago
    const rawMethod = String(invoice.paymentMethod || 'EFECTIVO').toLowerCase();
    let payLabel = 'EFECTIVO';
    if (rawMethod.includes('deb') || rawMethod.includes('master') || rawMethod.includes('visa deb')) payLabel = 'MASTER CARD DEBITO';
    else if (rawMethod.includes('cred') || rawMethod.includes('tarjeta')) payLabel = 'TARJETA DE CREDITO';
    else if (rawMethod.includes('transf') || rawMethod.includes('mp') || rawMethod.includes('mercado')) payLabel = 'MERCADO PAGO';
    else if (rawMethod.includes('cuenta') || rawMethod.includes('corriente')) payLabel = 'CTA. CORRIENTE';

    lines.push('Recibi(mos):');
    lines.push(padRow(`  ${payLabel}`, `$ ${fmtNum(total)}`));
    lines.push(divider);

    // Transparencia Fiscal Ley 27.743
    lines.push('Transparencia Fiscal (Ley 27.743)');
    lines.push(padRow('  IVA Contenido:', `$ ${fmtNum(ivaContenido)}`));
    lines.push(padRow('  Otros Imp. Nac. Indir.:', '$ 0,00'));
    lines.push(divider);

    // Operador y CAE
    lines.push(padRow('', 'Operador: 1'));
    let vtoDate = invoice.caeExpirationDate || '';
    if (vtoDate && vtoDate.length === 8 && /^\d{8}$/.test(vtoDate)) {
      vtoDate = `${vtoDate.slice(6, 8)}/${vtoDate.slice(4, 6)}/${vtoDate.slice(0, 4)}`;
    }
    lines.push(padRow(`CAE ${invoice.cae}`, `Vencim: ${vtoDate || 'N/A'}`));
    lines.push(divider);
    lines.push(center('COMPROBANTE AUTORIZADO POR ARCA'));

    return lines.join('\n');
  }

  /**
   * Genera el payload de comandos ESC/POS binarios completos incluyendo corte
   */
  generateEscPosBytes(invoice: any, paperWidth: 80 | 58 = 80): Uint8Array {
    const text = this.formatTicketText(invoice, paperWidth);
    const encoder = new TextEncoder();
    const textBytes = encoder.encode(text);

    // ESC @ (Init)
    const initCmd = new Uint8Array([0x1b, 0x40]);
    // Salto de 4 líneas y GS V 66 0 (Corte de papel completo/parcial)
    const cutCmd = new Uint8Array([0x0a, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00]);

    const fullPayload = new Uint8Array(initCmd.length + textBytes.length + cutCmd.length);
    fullPayload.set(initCmd, 0);
    fullPayload.set(textBytes, initCmd.length);
    fullPayload.set(cutCmd, initCmd.length + textBytes.length);

    return fullPayload;
  }

  /**
   * Envía la factura autorizada directamente a la impresora térmica SIN diálogo del navegador.
   *
   * VALIDA RIGUROSAMENTE:
   * - status === 'AUTORIZADA'
   * - cae !== null y longitud exacta de 14 dígitos numéricos
   *
   * Si la impresora está desconectada, arroja error descriptivo conservando la factura intacta.
   */
  async printFiscalTicket(
    invoice: any,
    options?: { printerName?: string; paperWidth?: 80 | 58 },
    emitterConfig?: any
  ): Promise<PrintResult> {
    // ─── REGLA 1: VALIDACIÓN FISCAL ESTRICTA ─────────────────────────
    if (!invoice) {
      throw new Error('Comprobante inválido o nulo.');
    }

    if (invoice.status !== 'AUTORIZADA') {
      throw new Error('La factura no fue autorizada por ARCA. No se puede imprimir el comprobante fiscal.');
    }

    const cae = String(invoice.cae || '').trim();
    if (!cae || !/^\d{14}$/.test(cae)) {
      throw new Error(
        `La factura no posee un CAE oficial válido de 14 dígitos emitido por ARCA (CAE actual: "${cae || 'null'}"). No se puede imprimir el comprobante fiscal.`
      );
    }

    const config = this.getConfig();
    const targetPrinter = options?.printerName || config.printerName || '';
    const paperWidth = options?.paperWidth || config.paperWidth || 80;

    // ─── REGLA 2: GENERACIÓN DE CONTENIDO TÉRMICO ───────────────────
    const ticketText = this.formatTicketText(invoice, paperWidth, emitterConfig);

    // ─── REGLA 3: INTENTO VIA QZ TRAY (ALTERNATIVA A) ───────────────
    let qzError: string | null = null;
    try {
      const qzConnected = await this.connectQz();
      if (qzConnected) {
        // Encontrar impresora por nombre o usar default
        const printer = targetPrinter ? await qz.printers.find(targetPrinter) : await qz.printers.getDefault();
        const qzConfig = qz.configs.create(printer, {
          encoding: 'UTF-8',
          rasterize: false
        });

        const qzData: any[] = [
          '\x1b\x40', // ESC @ (Reset)
          ticketText + '\n\n\n\n',
          '\x1d\x56\x42\x00' // GS V 66 0 (Corte de papel)
        ];

        // Si la factura posee imagen QR base64 y QZ lo soporta como imagen
        if (invoice.qrDataUrl && typeof invoice.qrDataUrl === 'string') {
          try {
            qzData.push({
              type: 'pixel',
              format: 'image',
              flavor: 'base64',
              data: invoice.qrDataUrl.replace(/^data:image\/\w+;base64,/, '')
            });
            qzData.push('\n\n\n\x1d\x56\x42\x00');
          } catch {}
        }

        await qz.print(qzConfig, qzData);

        return {
          success: true,
          method: 'qz-tray',
          printer: typeof printer === 'string' ? printer : targetPrinter || 'Default'
        };
      }
    } catch (err: any) {
      qzError = err.message || 'Fallo de comunicación con QZ Tray';
      console.warn('[ThermalPrinter] QZ Tray no disponible o falló:', qzError);
    }

    // ─── REGLA 4: FALLBACK A PUENTE LOCAL BACKEND (ALTERNATIVA B) ───
    try {
      const res = await axios.post('/api/printer/print', {
        printerName: targetPrinter,
        data: ticketText,
        format: 'text',
        cut: true
      }, { timeout: 8000 });

      if (res.data && res.data.success) {
        return {
          success: true,
          method: 'local-bridge',
          printer: targetPrinter || 'Default'
        };
      }
    } catch (apiErr: any) {
      console.warn('[ThermalPrinter] Puente local falló:', apiErr.message);
    }

    // ─── REGLA 5: MANEJO SEGURO DE ERROR (NO MUTAR LA FACTURA) ───────
    // Si la impresora física está desconectada o no responde:
    // La factura permanece AUTORIZADA y persistida. NUNCA se vuelve a emitir a ARCA.
    const failureMsg =
      `No se pudo conectar con la impresora térmica.\n` +
      `La factura fue autorizada correctamente por ARCA,\n` +
      `pero NO fue posible imprimirla.\n` +
      `CAE: ${cae}`;

    throw new Error(failureMsg);
  }
}

export const thermalPrinterService = new ThermalPrinterService();
