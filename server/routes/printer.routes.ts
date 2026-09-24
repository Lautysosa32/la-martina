import { Router, Request, Response } from 'express';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const router = Router();

export interface LocalPrinterInfo {
  name: string;
  isDefault?: boolean;
  type?: string;
  driverName?: string;
  portName?: string;
}

/**
 * Obtiene la lista de impresoras instaladas en el sistema operativo local.
 */
router.get('/printers', async (_req: Request, res: Response) => {
  try {
    if (process.platform === 'win32') {
      const psScript = `Get-Printer | Select-Object Name, Type, DriverName, PortName | ConvertTo-Json -Compress`;
      const { stdout } = await execAsync(`powershell -NoProfile -Command "${psScript}"`);
      
      let printers: LocalPrinterInfo[] = [];
      if (stdout.trim()) {
        try {
          const parsed = JSON.parse(stdout);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          printers = list.map((p: any) => ({
            name: p.Name || '',
            type: p.Type || '',
            driverName: p.DriverName || '',
            portName: p.PortName || ''
          }));
        } catch {
          // Fallback a regex si falla JSON
          const lines = stdout.split(/\r?\n/).filter(Boolean);
          printers = lines.map(name => ({ name: name.trim() }));
        }
      }
      return res.json({ success: true, platform: 'win32', printers });
    } else {
      // Linux / macOS (lpstat)
      const { stdout } = await execAsync('lpstat -p');
      const lines = stdout.split('\n');
      const printers: LocalPrinterInfo[] = [];
      for (const line of lines) {
        const match = line.match(/^printer (\S+)/);
        if (match) printers.push({ name: match[1] });
      }
      return res.json({ success: true, platform: process.platform, printers });
    }
  } catch (err: any) {
    console.error('[PrinterRoutes] Error consultando impresoras:', err.message);
    return res.status(500).json({
      success: false,
      error: `Error al consultar impresoras locales: ${err.message}`,
      printers: []
    });
  }
});

/**
 * Envía datos de impresión directamente a una impresora local sin diálogo del navegador.
 */
router.post('/print', async (req: Request, res: Response) => {
  const { printerName, data, format = 'text', cut = true } = req.body;

  if (!data) {
    return res.status(400).json({ success: false, error: 'Se requieren datos de impresión (data).' });
  }

  const tmpDir = os.tmpdir();
  const filename = `pos_ticket_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`;
  const filePath = path.join(tmpDir, filename);

  try {
    let buffer: Buffer;
    if (format === 'base64') {
      buffer = Buffer.from(data, 'base64');
    } else {
      buffer = Buffer.from(data, 'utf-8');
    }

    // Agregar comando de corte ESC/POS si se solicita y no viene en base64
    if (cut && format !== 'base64') {
      const cutCmd = Buffer.from('\x1d\x56\x42\x00', 'binary'); // GS V 66 0
      buffer = Buffer.concat([buffer, Buffer.from('\n\n\n\n'), cutCmd]);
    }

    await fs.promises.writeFile(filePath, buffer);

    if (printerName && printerName.trim()) {
      // Validar longitud máxima y ausencia de caracteres de control nulos/ASCII
      if (!/^[^\x00-\x1F\x7F]{1,200}$/.test(printerName)) {
        throw new Error("Nombre de impresora inválido. Formato no soportado.");
      }
    }

    if (process.platform === 'win32') {
      const scriptPath = path.join(__dirname, '../scripts/print.ps1');
      if (printerName && printerName.trim()) {
        await execFileAsync('powershell', [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-FilePath',
          filePath,
          '-PrinterName',
          printerName
        ]);
      } else {
        await execFileAsync('powershell', [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-FilePath',
          filePath
        ]);
      }
    } else {
      // CUPS en Linux/macOS
      const args = printerName && printerName.trim() ? ['-d', printerName, filePath] : [filePath];
      await execFileAsync('lp', args);
    }

    // Limpieza de archivo temporal
    setTimeout(() => {
      fs.unlink(filePath, () => {});
    }, 5000);

    return res.json({
      success: true,
      message: 'Trabajo de impresión enviado directamente a la impresora.',
      printer: printerName || 'Default'
    });
  } catch (err: any) {
    console.error('[PrinterRoutes] Error enviando trabajo de impresión:', err.message);
    try { fs.unlinkSync(filePath); } catch {}
    return res.status(502).json({
      success: false,
      error: `Error de comunicación con la impresora: ${err.message}`
    });
  }
});

export default router;
