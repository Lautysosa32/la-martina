export interface FriendlyArcaError {
  code: string;
  title: string;
  reason: string;
  suggestedAction: string;
  isRetryable: boolean;
}

const ERROR_MAP: Record<string, { title: string; reason: string; suggestedAction: string; isRetryable: boolean }> = {
  '10016': {
    title: 'Número de comprobante inconsistente',
    reason: 'El número de comprobante solicitado no coincide con el siguiente folio esperado por ARCA.',
    suggestedAction: 'Consultá el último comprobante autorizado en el punto de venta para sincronizar la numeración.',
    isRetryable: true
  },
  '10015': {
    title: 'Punto de venta no habilitado',
    reason: 'El punto de venta especificado no está dado de alta o no está autorizado para facturación electrónica en ARCA.',
    suggestedAction: 'Revisá en la web de ARCA en "Administración de Puntos de Venta" que el punto de venta esté asignado a Facturación Electrónica.',
    isRetryable: false
  },
  '10004': {
    title: 'CUIT del receptor inválido o no activo',
    reason: 'El CUIT del cliente receptor no está registrado en el padrón de ARCA o se encuentra en estado inactivo.',
    suggestedAction: 'Verificá el CUIT del cliente en la constancia de inscripción de ARCA y corregilo en el formulario.',
    isRetryable: false
  },
  '10020': {
    title: 'Inconsistencia impositiva',
    reason: 'La suma de las bases imponibles netas e importes de IVA no coincide exactamente con el total del comprobante.',
    suggestedAction: 'Verificá las cantidades y precios de los productos y sus alícuotas correspondientes.',
    isRetryable: false
  },
  '10061': {
    title: 'Fecha de comprobante fuera de rango',
    reason: 'La fecha del comprobante tiene más de 10 días de diferencia respecto de la fecha actual de ARCA.',
    suggestedAction: 'Asegurate de emitir el comprobante con la fecha del día de hoy.',
    isRetryable: false
  },
  'CERT_EXPIRED': {
    title: 'Certificado digital vencido',
    reason: 'El certificado X.509 de facturación electrónica configurado en el servidor ha caducado.',
    suggestedAction: 'Generá un nuevo CSR y descargá el certificado actualizado desde la página de ARCA.',
    isRetryable: false
  },
  'AUTH_FAILED': {
    title: 'Error de autenticación WSAA',
    reason: 'No se pudo obtener el Ticket de Acceso ante ARCA. Verificá la clave privada y certificado.',
    suggestedAction: 'Revisá que el certificado esté asociado al computador fiscal y con relaciones activas en ARCA.',
    isRetryable: false
  },
  'TIMEOUT': {
    title: 'Tiempo de espera agotado con ARCA',
    reason: 'El servidor de ARCA tardó demasiado en responder o la conexión se interrumpió durante el envío.',
    suggestedAction: 'La operación quedó en ESTADO_DESCONOCIDO. Utilizá el botón "Reconciliar Estado" para comprobar si ARCA lo autorizó antes de intentar de nuevo.',
    isRetryable: false
  },
  'NETWORK_ERROR': {
    title: 'Fallo de conectividad',
    reason: 'No se pudo establecer comunicación de red con los servidores de ARCA.',
    suggestedAction: 'Comprobá la conexión a Internet y el estado de los servidores de ARCA.',
    isRetryable: true
  }
};

/**
 * Traduce un error técnico o código de ARCA a una estructura amigable y clara para el usuario.
 */
export function translateArcaError(codeOrMessage: string, rawDetail?: string): FriendlyArcaError {
  const code = (codeOrMessage || 'UNKNOWN').trim();

  // Buscar coincidencia exacta por código
  if (ERROR_MAP[code]) {
    return {
      code,
      ...ERROR_MAP[code]
    };
  }

  // Búsqueda por patrones en el mensaje
  const lower = (codeOrMessage + ' ' + (rawDetail || '')).toLowerCase();

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('etimedout')) {
    return {
      code: 'TIMEOUT',
      ...ERROR_MAP['TIMEOUT']
    };
  }

  if (lower.includes('cert') && (lower.includes('expired') || lower.includes('vencido'))) {
    return {
      code: 'CERT_EXPIRED',
      ...ERROR_MAP['CERT_EXPIRED']
    };
  }

  if (lower.includes('auth') || lower.includes('token') || lower.includes('sign') || lower.includes('cms')) {
    return {
      code: 'AUTH_FAILED',
      ...ERROR_MAP['AUTH_FAILED']
    };
  }

  if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('network') || lower.includes('socket')) {
    return {
      code: 'NETWORK_ERROR',
      ...ERROR_MAP['NETWORK_ERROR']
    };
  }

  // Error genérico
  return {
    code,
    title: 'ARCA rechazó el comprobante',
    reason: rawDetail || codeOrMessage || 'Ocurrió un error al procesar el comprobante ante ARCA.',
    suggestedAction: 'Verificá los datos fiscales de la venta e intentá nuevamente.',
    isRetryable: false
  };
}
