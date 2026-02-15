import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapViewProps {
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
  ip?: string;
}

export function MapView({ latitude, longitude, city, country, ip }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Clean up existing map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    // Create new map
    const map = L.map(mapRef.current, {
      center: [latitude, longitude],
      zoom: 10,
      zoomControl: true,
      scrollWheelZoom: false,
    });

    // Add dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Custom marker icon
    const customIcon = L.divIcon({
      className: 'custom-marker',
      html: `
        <div class="relative">
          <div class="absolute -top-4 -left-4 w-8 h-8 rounded-full opacity-30 animate-ping" style="background: #00d4ff;"></div>
          <div class="absolute -top-3 -left-3 w-6 h-6 rounded-full flex items-center justify-center" style="background: #00d4ff;">
            <div class="w-3 h-3 bg-white rounded-full"></div>
          </div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    // Add marker
    const locationParts = [city, country].filter(Boolean).join(', ');
    const popupContent = `
      <div class="text-dark-text-primary bg-dark-surface p-2 rounded">
        <div class="font-bold">${ip || 'IP Location'}</div>
        <div class="text-sm text-gray-400">${locationParts || 'Unknown location'}</div>
        <div class="text-xs text-gray-500 mt-1">${latitude.toFixed(4)}, ${longitude.toFixed(4)}</div>
      </div>
    `;

    L.marker([latitude, longitude], { icon: customIcon })
      .addTo(map)
      .bindPopup(popupContent, {
        className: 'dark-popup',
      })
      .openPopup();

    // Add accuracy circle (approximate)
    L.circle([latitude, longitude], {
      color: '#00d4ff',
      fillColor: '#00d4ff',
      fillOpacity: 0.1,
      radius: 10000, // 10km radius
      weight: 1,
    }).addTo(map);

    mapInstanceRef.current = map;

    // Cleanup on unmount
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [latitude, longitude, city, country, ip]);

  return (
    <div className="relative">
      <div
        ref={mapRef}
        className="h-64 w-full rounded-lg overflow-hidden border border-dark-border"
        style={{ background: '#0a0a0f' }}
      />
      <div className="absolute bottom-2 left-2 z-[1000] bg-dark-surface/90 px-2 py-1 rounded text-xs text-dark-text-muted">
        {latitude.toFixed(4)}, {longitude.toFixed(4)}
      </div>
    </div>
  );
}
