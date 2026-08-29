import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAdmin } from '../context/AdminContext';
import { calculateDistanceKm } from '../utils/shipping';

interface DeliveryZonesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DeliveryZonesModal: React.FC<DeliveryZonesModalProps> = ({ isOpen, onClose }) => {
  const { generalConfig } = useAdmin();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);

  const storeLat = generalConfig.storeLat || -33.459009;
  const storeLng = generalConfig.storeLng || -67.551826;
  const radiusKm = generalConfig.deliveryRadiusKm || 5;

  const [isLocating, setIsLocating] = useState(false);
  const [locatingStatus, setLocatingStatus] = useState<{
    inside: boolean;
    distanceKm: number;
  } | null>(null);
  const [locatingError, setLocatingError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setLocatingStatus(null);
      setLocatingError(null);
      return;
    }

    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;

      // Limpiar mapa previo si existiera
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      // Inicializar mapa de Leaflet centrado en la sucursal
      const map = L.map(mapContainerRef.current, {
        center: [storeLat, storeLng],
        zoom: 13,
        zoomControl: false
      });
      mapRef.current = map;

      // Añadir capa de OpenStreetMap
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(map);

      // Control de zoom arriba a la derecha
      L.control.zoom({ position: 'topright' }).addTo(map);

      // Círculo del radio de entrega
      const circle = L.circle([storeLat, storeLng], {
        radius: radiusKm * 1000,
        color: '#c00010',
        fillColor: '#c00010',
        fillOpacity: 0.12,
        weight: 2.5,
        dashArray: '6, 6'
      }).addTo(map);

      // Ajustar vista para encuadrar todo el radio
      map.fitBounds(circle.getBounds(), { padding: [20, 20] });

      // Pin de la sucursal
      const storePin = L.divIcon({
        html: `
          <div class="relative flex items-center justify-center">
            <div class="bg-primary text-white p-2 rounded-2xl shadow-xl flex items-center justify-center border-2 border-white ring-4 ring-primary/20 scale-110">
              <span class="material-symbols-outlined text-[20px]">storefront</span>
            </div>
            <span class="absolute -bottom-6 bg-black/80 text-white font-bold text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap shadow-md">
              La Martina
            </span>
          </div>
        `,
        className: 'store-custom-pin',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      L.marker([storeLat, storeLng], { icon: storePin })
        .addTo(map)
        .bindPopup('<b>Supermercado La Martina</b><br/>Punto de partida de envíos');
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isOpen, storeLat, storeLng, radiusKm]);

  // Manejador para geolocalizar al usuario y verificar si está dentro del radio
  const handleCheckUserLocation = () => {
    if (!navigator.geolocation) {
      setLocatingError('Tu navegador no soporta geolocalización.');
      return;
    }

    setIsLocating(true);
    setLocatingError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const { latitude, longitude } = position.coords;
        const dist = calculateDistanceKm(storeLat, storeLng, latitude, longitude);
        const inside = dist <= radiusKm;

        setLocatingStatus({
          inside,
          distanceKm: parseFloat(dist.toFixed(2))
        });

        if (mapRef.current) {
          if (userMarkerRef.current) {
            userMarkerRef.current.remove();
          }

          const userPin = L.divIcon({
            html: `
              <div class="relative flex items-center justify-center">
                <div class="${inside ? 'bg-green-600 ring-green-400/30' : 'bg-amber-600 ring-amber-400/30'} text-white p-1.5 rounded-full shadow-lg border-2 border-white ring-4 flex items-center justify-center animate-bounce">
                  <span class="material-symbols-outlined text-[18px]">person_pin_circle</span>
                </div>
                <span class="absolute -bottom-5 bg-black/80 text-white font-bold text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap">
                  Tu ubicación
                </span>
              </div>
            `,
            className: 'user-custom-pin',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });

          userMarkerRef.current = L.marker([latitude, longitude], { icon: userPin }).addTo(mapRef.current);
          mapRef.current.setView([latitude, longitude], 14, { animate: true });
        }
      },
      (error) => {
        setIsLocating(false);
        console.warn('Geolocation error:', error);
        setLocatingError('No pudimos acceder a tu ubicación. Verificá los permisos del navegador.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-surface-container-lowest w-full max-w-2xl rounded-3xl shadow-2xl border border-outline-variant/20 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-outline-variant/15 flex items-center justify-between bg-surface-container-low">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-xs">
              <span className="material-symbols-outlined text-[24px]">local_shipping</span>
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-on-surface leading-tight">
                Zonas de Cobertura de Envíos
              </h3>
              <p className="text-xs text-on-surface-variant font-medium">
                Radio de entrega directa de Supermercado La Martina
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar modal"
            className="w-9 h-9 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant flex items-center justify-center transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Info & Radius Specs */}
        <div className="px-4 py-3 bg-primary/5 border-b border-primary/10 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-on-surface">
            <span className="material-symbols-outlined text-primary text-[18px]">share_location</span>
            <span>
              Radio máximo de cobertura: <strong className="text-primary font-black">{radiusKm} km</strong>
            </span>
          </div>
          <button
            onClick={handleCheckUserLocation}
            disabled={isLocating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-outline-variant/30 text-on-surface font-bold hover:bg-primary hover:text-white hover:border-primary transition-all shadow-xs cursor-pointer text-xs disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">
              {isLocating ? 'hourglass_top' : 'my_location'}
            </span>
            <span>{isLocating ? 'Obteniendo ubicación...' : 'Comprobar mi ubicación'}</span>
          </button>
        </div>

        {/* Locating feedback notification */}
        {locatingStatus && (
          <div className={`px-4 py-2.5 text-xs font-bold flex items-center gap-2 border-b ${
            locatingStatus.inside 
              ? 'bg-green-50 text-green-800 border-green-200' 
              : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}>
            <span className="material-symbols-outlined text-[18px]">
              {locatingStatus.inside ? 'check_circle' : 'warning'}
            </span>
            <span>
              {locatingStatus.inside
                ? `¡Genial! Estás a ${locatingStatus.distanceKm} km de la sucursal, dentro de nuestra zona de envío directo.`
                : `Estás a ${locatingStatus.distanceKm} km de la sucursal. Supera nuestro radio habitual de ${radiusKm} km.`}
            </span>
          </div>
        )}

        {locatingError && (
          <div className="px-4 py-2 bg-red-50 text-red-700 text-xs font-medium border-b border-red-200 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">error</span>
            <span>{locatingError}</span>
          </div>
        )}

        {/* Map Container */}
        <div className="relative w-full h-[320px] sm:h-[380px] bg-surface-container">
          <div ref={mapContainerRef} className="w-full h-full" />
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-surface-container-low border-t border-outline-variant/15 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-on-surface-variant">
            <span className="material-symbols-outlined text-green-600 text-[18px]">ac_unit</span>
            <span>Entregas con cadena de frío garantizada en el día.</span>
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-all cursor-pointer shadow-xs"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
