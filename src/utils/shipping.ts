/**
 * Utilidades para cálculo de distancia geográfica y costo de envío dinámico.
 */

export interface ShippingCalculationParams {
  distanceKm?: number | null;
  cartTotal?: number;
  baseCost: number;
  costPerKm: number;
  freeShippingMinAmount?: number;
  isPickup?: boolean;
}

export interface ShippingCalculationResult {
  cost: number;
  distanceKm: number | null;
  isFreeShipping: boolean;
  isEstimated: boolean;
  breakdownText: string;
}

/**
 * Calcula la distancia en kilómetros entre dos coordenadas geográficas (Fórmula de Haversine).
 */
export const calculateDistanceKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Radio terrestre medio en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Calcula el costo de envío dinámico según la distancia y la configuración de tarifas.
 */
export const calculateShippingCost = (
  params: ShippingCalculationParams
): ShippingCalculationResult => {
  const {
    distanceKm,
    cartTotal = 0,
    baseCost = 1000,
    costPerKm = 400,
    freeShippingMinAmount = 0,
    isPickup = false
  } = params;

  // 1. Si es retiro en sucursal: siempre gratis
  if (isPickup) {
    return {
      cost: 0,
      distanceKm: 0,
      isFreeShipping: false,
      isEstimated: false,
      breakdownText: 'Retiro en sucursal (Gratis)'
    };
  }

  // 2. Si aplica envío gratis por monto de compra
  if (freeShippingMinAmount && freeShippingMinAmount > 0 && cartTotal >= freeShippingMinAmount) {
    return {
      cost: 0,
      distanceKm: distanceKm ?? null,
      isFreeShipping: true,
      isEstimated: false,
      breakdownText: '¡Envío gratis por monto de compra!'
    };
  }

  // 3. Si se conoce la distancia exacta en km
  if (distanceKm !== undefined && distanceKm !== null && !isNaN(distanceKm) && distanceKm >= 0) {
    const rawCost = baseCost + distanceKm * costPerKm;
    // Redondear al entero más cercano
    const cost = Math.round(rawCost);
    return {
      cost,
      distanceKm: Number(distanceKm.toFixed(2)),
      isFreeShipping: false,
      isEstimated: false,
      breakdownText: `$${cost.toLocaleString('es-AR')} (${distanceKm.toFixed(1)} km)`
    };
  }

  // 4. Si aún no se conoce la distancia (visitante nuevo en carrito): tarifa base de referencia
  return {
    cost: Math.round(baseCost),
    distanceKm: null,
    isFreeShipping: false,
    isEstimated: true,
    breakdownText: `$${Math.round(baseCost).toLocaleString('es-AR')} (Tarifa base estimada)`
  };
};
