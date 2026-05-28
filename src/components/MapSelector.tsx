import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapSelectorProps {
  initialLat?: number;
  initialLng?: number;
  onLocationSelected: (lat: number, lng: number, address: string) => void;
  onClose: () => void;
}

export const MapSelector: React.FC<MapSelectorProps> = ({
  initialLat = -33.4588047,
  initialLng = -67.5539972,
  onLocationSelected,
  onClose
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: initialLat,
    lng: initialLng
  });
  const [addressLabel, setAddressLabel] = useState<string>('Buscando dirección...');
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [locatingError, setLocatingError] = useState<string | null>(null);

  // SVG Marker design to avoid Leaflet standard asset issues in Vite bundles
  const customSvgIcon = L.divIcon({
    html: `
      <div class="relative flex items-center justify-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="drop-shadow-lg filter">
          <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill="#F24E1E"/>
        </svg>
        <span class="absolute w-2 h-2 bg-black/35 rounded-full blur-[2px] -bottom-[1px] scale-x-150"></span>
      </div>
    `,
    className: 'custom-map-pin',
    iconSize: [40, 40],
    iconAnchor: [20, 38]
  });

  // Reverse geocoding using OSM Nominatim
  const performReverseGeocoding = async (lat: number, lng: number) => {
    setIsGeocoding(true);
    setAddressLabel('Buscando dirección...');
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'es',
            'User-Agent': 'LaMartinaSupermarketDeliveryMap/1.0'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        const address = data.address;
        
        // Build a friendly label from Nominatim results
        const street = address.road || address.pedestrian || address.suburb || '';
        const number = address.house_number || '';
        const city = address.city || address.town || address.village || 'La Paz';
        
        let label = '';
        if (street) {
          label = number ? `${street} ${number}` : street;
          if (city) label += `, ${city}`;
        } else {
          label = data.display_name?.split(',').slice(0, 3).join(',') || `Ubicación (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
        }

        setAddressLabel(label);
      } else {
        setAddressLabel(`Coordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }
    } catch (error) {
      console.error('Error during reverse geocoding:', error);
      setAddressLabel(`Ubicación seleccionada (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
    } finally {
      setIsGeocoding(false);
    }
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Initialize Leaflet Map
    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 16,
      zoomControl: false // We will render our own custom styled zoom controls later or use default at a better position
    });
    mapRef.current = map;

    // Add beautiful OpenStreetMap tile layer (Hot style or Standard)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    // Add standard zoom control at top right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Create marker at initial coordinates
    const marker = L.marker([initialLat, initialLng], {
      icon: customSvgIcon,
      draggable: true
    }).addTo(map);
    markerRef.current = marker;

    // Trigger initial geocoding
    performReverseGeocoding(initialLat, initialLng);

    // Marker drag events
    marker.on('dragend', () => {
      const position = marker.getLatLng();
      setCoords({ lat: position.lat, lng: position.lng });
      performReverseGeocoding(position.lat, position.lng);
      map.panTo(position);
    });

    // Map click events (to let user tap on map to position the marker)
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      marker.setLatLng([lat, lng]);
      setCoords({ lat, lng });
      performReverseGeocoding(lat, lng);
      map.panTo([lat, lng]);
    });

    // Clean up
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Handle locating the user via GPS
  const handleLocateUser = () => {
    if (!navigator.geolocation) {
      setLocatingError('La geolocalización no está soportada por tu navegador.');
      return;
    }

    setIsLocating(true);
    setLocatingError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCoords({ lat: latitude, lng: longitude });
        
        if (mapRef.current && markerRef.current) {
          mapRef.current.setView([latitude, longitude], 17);
          markerRef.current.setLatLng([latitude, longitude]);
        }
        
        performReverseGeocoding(latitude, longitude);
        setIsLocating(false);
      },
      (error) => {
        console.error('Error locating user:', error);
        let errorMsg = 'No pudimos obtener tu ubicación.';
        if (error.code === 1) errorMsg = 'Permiso denegado. Habilitá el GPS en tu navegador.';
        else if (error.code === 2) errorMsg = 'Ubicación no disponible en este momento.';
        else if (error.code === 3) errorMsg = 'Tiempo de espera agotado al obtener ubicación.';
        
        setLocatingError(errorMsg);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleConfirm = () => {
    onLocationSelected(coords.lat, coords.lng, addressLabel);
  };

  return (
    <div className="fixed inset-0 z-[110] flex flex-col md:items-center md:justify-center p-0 md:p-4 animate-in fade-in duration-300">
      {/* Background overlay */}
      <div className="absolute inset-0 bg-on-background/70 backdrop-blur-sm" onClick={onClose}></div>

      {/* Modal Container */}
      <div className="bg-white w-full h-full md:h-[85vh] md:max-w-3xl md:rounded-[2rem] overflow-hidden shadow-2xl relative z-10 flex flex-col animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant/10 flex justify-between items-center bg-white shrink-0">
          <div>
            <h3 className="text-lg md:text-xl font-bold text-on-background">Seleccioná tu Ubicación</h3>
            <p className="text-[11px] text-on-surface-variant font-medium">Arrastrá el pin rojo o tocá el mapa</p>
          </div>
          <button 
            onClick={onClose} 
            type="button"
            className="w-10 h-10 hover:bg-surface-container-high rounded-full transition-colors flex items-center justify-center text-on-surface-variant"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        {/* Map Container View */}
        <div className="flex-1 relative bg-surface-container-low min-h-0">
          <div ref={mapContainerRef} className="w-full h-full" style={{ outline: 'none' }} />

          {/* GPS Button Overlay */}
          <button
            type="button"
            onClick={handleLocateUser}
            disabled={isLocating}
            className="absolute bottom-6 right-6 z-[1000] w-12 h-12 bg-white text-primary rounded-full shadow-lg flex items-center justify-center hover:bg-surface-container-lowest transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
            title="Usar mi ubicación actual"
          >
            {isLocating ? (
              <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
            ) : (
              <span className="material-symbols-outlined text-[24px]">my_location</span>
            )}
          </button>

          {/* Locating error warning overlay */}
          {locatingError && (
            <div className="absolute top-4 left-4 right-4 z-[1000] p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 shadow-md animate-in slide-in-from-top-2 duration-300">
              <span className="material-symbols-outlined text-error text-[18px]">error</span>
              <p className="text-xs text-red-700 font-bold flex-1">{locatingError}</p>
              <button 
                type="button"
                onClick={() => setLocatingError(null)} 
                className="text-red-500 font-bold hover:text-red-700 text-xs px-1"
              >
                Cerrar
              </button>
            </div>
          )}
        </div>

        {/* Details & Actions Footer */}
        <div className="p-6 bg-white border-t border-outline-variant/10 shrink-0 space-y-4">
          
          {/* Selected Address Display card */}
          <div className="bg-[#fcf9f8] p-4 rounded-2xl border border-outline-variant/20 flex gap-3 items-start">
            <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center ${isGeocoding ? 'bg-primary/10 text-primary animate-pulse' : 'bg-primary text-white'}`}>
              <span className="material-symbols-outlined text-[18px]">
                {isGeocoding ? 'autorenew' : 'location_on'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Dirección aproximada</p>
              <p className="font-bold text-sm text-on-surface truncate leading-tight mt-0.5">
                {addressLabel}
              </p>
              <p className="text-[10px] text-on-surface-variant font-medium mt-0.5">
                Lat: {coords.lat.toFixed(6)}, Lng: {coords.lng.toFixed(6)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 border-2 border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low transition-colors rounded-2xl font-bold text-sm text-center"
            >
              CANCELAR
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isGeocoding}
              className="flex-1 py-4 bg-primary text-white hover:bg-primary/90 transition-all rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 disabled:opacity-50 text-center"
            >
              CONFIRMAR DIRECCIÓN
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
