import { Request, Response, NextFunction } from 'express';

export function validateAuthorizePayload(req: Request, res: Response, next: NextFunction): void {
  const { saleIds, pointOfSale, invoiceType, customer, items } = req.body;
  const idempotencyKey = (req.headers['x-idempotency-key'] as string) || req.body.idempotencyKey;

  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 6) {
    res.status(400).json({
      success: false,
      error: 'Validación fiscal: Se requiere una clave de idempotencia válida (mínimo 6 caracteres).'
    });
    return;
  }

  if (!pointOfSale || typeof pointOfSale !== 'number' || pointOfSale <= 0 || !Number.isInteger(pointOfSale)) {
    res.status(400).json({
      success: false,
      error: 'Validación fiscal: El punto de venta debe ser un número entero positivo.'
    });
    return;
  }

  if (!invoiceType || !['A', 'B', 'C'].includes(invoiceType)) {
    res.status(400).json({
      success: false,
      error: 'Validación fiscal: El tipo de comprobante debe ser A, B o C.'
    });
    return;
  }

  if (!customer || typeof customer !== 'object') {
    res.status(400).json({
      success: false,
      error: 'Validación fiscal: Los datos del cliente receptor son obligatorios.'
    });
    return;
  }

  if (!customer.name || typeof customer.name !== 'string' || customer.name.trim().length === 0) {
    res.status(400).json({
      success: false,
      error: 'Validación fiscal: El nombre o razón social del cliente es obligatorio.'
    });
    return;
  }

  if (!customer.taxCondition || typeof customer.taxCondition !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Validación fiscal: La condición frente al IVA del cliente es obligatoria.'
    });
    return;
  }

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({
      success: false,
      error: 'Validación fiscal: Debe incluir al menos un ítem en el comprobante.'
    });
    return;
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || typeof it !== 'object') {
      res.status(400).json({
        success: false,
        error: `Validación fiscal: El ítem en la posición ${i + 1} no es válido.`
      });
      return;
    }
    if (!it.description || typeof it.description !== 'string' || it.description.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: `Validación fiscal: La descripción del ítem #${i + 1} es obligatoria.`
      });
      return;
    }
    if (typeof it.quantity !== 'number' || it.quantity <= 0 || isNaN(it.quantity)) {
      res.status(400).json({
        success: false,
        error: `Validación fiscal: La cantidad del ítem "${it.description}" debe ser un número mayor a cero.`
      });
      return;
    }
    if (typeof it.price !== 'number' || it.price < 0 || isNaN(it.price)) {
      res.status(400).json({
        success: false,
        error: `Validación fiscal: El precio del ítem "${it.description}" no puede ser negativo.`
      });
      return;
    }
  }

  next();
}

export function validateExternalInvoicePayload(req: Request, res: Response, next: NextFunction): void {
  const {
    pointOfSale,
    invoiceType,
    invoiceNumber,
    cae,
    caeExpirationDate,
    totalAmount,
    customerName,
    customerDocumentNumber,
    date
  } = req.body;

  if (!pointOfSale || typeof pointOfSale !== 'number' || pointOfSale <= 0) {
    res.status(400).json({ success: false, error: 'Punto de venta inválido.' });
    return;
  }

  if (!invoiceNumber || typeof invoiceNumber !== 'number' || invoiceNumber <= 0) {
    res.status(400).json({ success: false, error: 'Número de comprobante inválido.' });
    return;
  }

  if (!cae || typeof cae !== 'string' || !/^\d{14}$/.test(cae.trim())) {
    res.status(400).json({ success: false, error: 'El CAE debe contener exactamente 14 dígitos numéricos.' });
    return;
  }

  if (!caeExpirationDate || typeof caeExpirationDate !== 'string') {
    res.status(400).json({ success: false, error: 'Fecha de vencimiento de CAE obligatoria.' });
    return;
  }

  if (typeof totalAmount !== 'number' || totalAmount <= 0 || isNaN(totalAmount)) {
    res.status(400).json({ success: false, error: 'Importe total debe ser un número positivo.' });
    return;
  }

  if (!customerName || typeof customerName !== 'string' || customerName.trim().length === 0) {
    res.status(400).json({ success: false, error: 'Nombre de cliente obligatorio.' });
    return;
  }

  next();
}
