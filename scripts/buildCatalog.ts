import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

console.log('⏳ Leyendo archivo Excel (puede tardar un momento)...');
const filePath = path.join(process.cwd(), 'ProductosM.csv.xlsx');

try {
  const wb = xlsx.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];

  console.log(`✅ Hoja leída: ${sheetName}`);
  
  // Extraemos usando json format
  const rows = xlsx.utils.sheet_to_json(sheet) as Array<{
    id_producto: string | number;
    productos_descripcion: string;
    productos_marca: string;
  }>;
  
  console.log(`✅ ${rows.length} filas extraídas.`);

  const catalog: Record<string, { n: string; b: string }> = {};

  let valid = 0;
  for (const row of rows) {
    if (!row.id_producto) continue;
    
    const barcode = String(row.id_producto).trim();
    if (!barcode) continue;

    catalog[barcode] = {
      n: (row.productos_descripcion || '').trim(),
      b: (row.productos_marca || '').toString().trim()
    };
    valid++;
  }

  console.log(`✅ ${valid} productos válidos procesados.`);

  const outputPath = path.join(process.cwd(), 'public', 'fallback_catalog.json');
  fs.writeFileSync(outputPath, JSON.stringify(catalog));

  console.log(`🚀 Catálogo guardado exitosamente en: ${outputPath}`);
  console.log(`📦 Tamaño del archivo: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);

} catch (error) {
  console.error('❌ Error construyendo el catálogo:', error);
}
