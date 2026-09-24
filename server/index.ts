import express from 'express';
import dotenv from 'dotenv';
import arcaRoutes from './routes/arca.routes';
import printerRoutes from './routes/printer.routes';
import { requireAuth, requireRole } from './middleware/auth.middleware';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Configuración de CORS y Headers de Seguridad
app.use((req, res, next) => {
  const allowedOrigin = process.env.FRONTEND_URL || '*';
  res.header('Access-Control-Allow-Origin', allowedOrigin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Idempotency-Key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Montar Rutas de Facturación Electrónica ARCA y Puente de Impresión Local
app.use('/api/arca', arcaRoutes);
app.use('/api/printer', requireAuth, requireRole(['admin', 'owner', 'cashier']), printerRoutes);

// Healthcheck
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Martina Supermercado ARCA Backend', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Martina Supermercado Backend Fiscal ARCA corriendo en http://localhost:${PORT}`);
});

export default app;
