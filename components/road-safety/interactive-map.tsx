'use client';

import { useEffect, useRef, useState } from 'react';
import { OlaMaps, defaultStyleJson, type OlaMapsWeb } from 'olamaps-web-sdk';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { RouteData, RoadCondition, RiskLevel, TrafficData } from '@/lib/types';

// Suppress known Ola Maps console errors
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const message = args[0]?.toString() || '';
  if (message.includes('3d_model') || message.includes('vectordata')) {
    return;
  }
  originalConsoleError.apply(console, args);
};

interface InteractiveMapProps {
  apiKey: string;
  route?: RouteData;
  roadCondition?: RoadCondition;
  traffic?: TrafficData;
  riskLevel?: RiskLevel;
  isLoading?: boolean;
}

const INDIA_CENTER: [number, number] = [78.9629, 20.5937];

const riskColors: Record<RiskLevel, string> = {
  LOW: '#22c55e',
  MEDIUM: '#eab308',
  HIGH: '#ef4444',
};

function decodePolyline(encoded: string): Array<[number, number]> {
  if (!encoded) return [];
  const coordinates: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = (result & 1) ? ~(result >> 1) : result >> 1;
    lat += deltaLat;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = (result & 1) ? ~(result >> 1) : result >> 1;
    lng += deltaLng;
    coordinates.push([lng * 1e-5, lat * 1e-5]);
  }
  return coordinates;
}

async function fetchOlaDirections(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  apiKey: string
): Promise<Array<[number, number]>> {
  try {
    const origin = `${originLat},${originLng}`;
    const dest = `${destLat},${destLng}`;
    const url = `https://api.olamaps.io/routing/v1/directions?api_key=${apiKey}&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Ola API error: ${response.status}`);
    const data = await response.json();
    const routeData = data?.routes?.[0];
    const polylineStr =
      routeData?.overview_polyline?.points ||
      routeData?.overview_polyline?.encoded_polyline ||
      routeData?.overview_polyline ||
      '';
    if (polylineStr) {
      const decoded = decodePolyline(polylineStr);
      if (decoded.length > 5) return decoded;
    }
    // Fallback: extract from steps
    const leg = routeData?.legs?.[0];
    if (leg?.steps) {
      const points: Array<[number, number]> = [];
      for (const step of leg.steps) {
        const sp = step.polyline?.points || step.polyline?.encoded_polyline || step.polyline || '';
        if (sp) {
          const decoded = decodePolyline(sp);
          points.push(...decoded);
        }
      }
      if (points.length > 5) return points;
    }
  } catch (err) {
    console.warn('[Map] Ola directions fetch failed:', err);
  }
  return [];
}

export function InteractiveMap({
  apiKey,
  route,
  roadCondition,
  traffic,
  riskLevel,
  isLoading,
}: InteractiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<OlaMapsWeb.Map | null>(null);
  const markersRef = useRef<Array<{ remove: () => void }>>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    if (!apiKey) {
      setMapError('OLA_MAPS_API_KEY is missing');
      return;
    }

    let mounted = true;

    const initMap = async () => {
      try {
        const olaMaps = new OlaMaps({ apiKey });
        const map = await olaMaps.init({
          container: mapContainerRef.current!,
          center: INDIA_CENTER,
          zoom: 4.8,
          style: defaultStyleJson,
        });

        map.addControl(new OlaMaps.NavigationControl({ showCompass: true }), 'top-right');
        map.addControl(
          new OlaMaps.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
          }),
          'top-right'
        );

        if (mounted) {
          mapRef.current = map;
          setMapReady(true);
        } else {
          map.remove();
        }
      } catch (error) {
        setMapError(error instanceof Error ? error.message : 'Failed to load Ola Maps');
      }
    };

    void initMap();

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [apiKey]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !route) return;
    const map = mapRef.current;
    map.resize();

    // Remove existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Build route coordinates in priority order:
    // 1. Decoded polyline (most detailed, follows roads)
    // 2. Waypoints array
    // 3. Origin/destination only (fallback)
    const polylineCoords = route.polyline ? decodePolyline(route.polyline) : [];
    const waypointCoords =
      route.waypoints && route.waypoints.length > 1
        ? route.waypoints.map((p) => [p.lng, p.lat] as [number, number])
        : [];
    const simpleCoords: Array<[number, number]> = [
      [route.origin.coordinates.lng, route.origin.coordinates.lat],
      [route.destination.coordinates.lng, route.destination.coordinates.lat],
    ];

    // Choose the best available coordinates
    const primaryCoords =
      polylineCoords.length > 5 ? polylineCoords
      : waypointCoords.length > 5 ? waypointCoords
      : simpleCoords;

    // Helper: update the route line on the map
    const updateRouteLine = (coordinates: Array<[number, number]>) => {
      const geojson: FeatureCollection<LineString> = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates },
        }],
      };

      if (map.getSource('route-source')) {
        (map.getSource('route-source') as OlaMapsWeb.GeoJSONSource).setData(geojson);
      } else {
        map.addSource('route-source', { type: 'geojson', data: geojson });
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route-source',
          paint: {
            'line-color': riskLevel ? riskColors[riskLevel] : '#2563eb',
            'line-width': 5,
            'line-opacity': 0.9,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
      }

      // Fit map bounds to show the entire route
      if (coordinates.length > 0) {
        const bounds = new OlaMaps.LngLatBounds(
          [route.origin.coordinates.lng, route.origin.coordinates.lat],
          [route.destination.coordinates.lng, route.destination.coordinates.lat]
        );
        coordinates.forEach((c) => bounds.extend(c));
        map.fitBounds(bounds, { padding: 72, animate: true });
      }
    };

    // Draw route immediately with best available data
    updateRouteLine(primaryCoords);

    // If we don't have a good polyline, try fetching detailed route from Ola Maps in the browser
    if (primaryCoords.length <= 5 && apiKey) {
      fetchOlaDirections(
        route.origin.coordinates.lat,
        route.origin.coordinates.lng,
        route.destination.coordinates.lat,
        route.destination.coordinates.lng,
        apiKey
      ).then((olaCoords) => {
        if (olaCoords.length > primaryCoords.length) {
          updateRouteLine(olaCoords);
        }
      });
    }

    // Add origin/destination markers
    const startMarker = new OlaMaps.Marker({ color: '#2563eb' })
      .setLngLat([route.origin.coordinates.lng, route.origin.coordinates.lat])
      .setPopup(
        new OlaMaps.Popup({ offset: 16 }).setHTML(
          `<strong>Origin</strong><br/>${route.origin.address}`
        )
      )
      .addTo(map);

    const endMarker = new OlaMaps.Marker({ color: riskLevel ? riskColors[riskLevel] : '#16a34a' })
      .setLngLat([route.destination.coordinates.lng, route.destination.coordinates.lat])
      .setPopup(
        new OlaMaps.Popup({ offset: 16 }).setHTML(
          `<strong>Destination</strong><br/>${route.destination.address}`
        )
      )
      .addTo(map);

    markersRef.current.push(startMarker, endMarker);

    // Add road hazards and traffic incidents as safety points.
    const hazardFeatures: Array<Feature<Point>> = (roadCondition?.hazards || []).map((hazard, index) => ({
      type: 'Feature',
      properties: { label: hazard.type.replace(/_/g, ' '), severity: hazard.severity, kind: 'ROAD', id: `hazard-${index}` },
      geometry: { type: 'Point', coordinates: [hazard.location.lng, hazard.location.lat] },
    }));
    const incidentFeatures: Array<Feature<Point>> = (traffic?.incidents || []).map((incident, index) => ({
      type: 'Feature',
      properties: { label: incident.type.replace(/_/g, ' '), severity: incident.severity, kind: 'TRAFFIC', id: `traffic-${index}` },
      geometry: { type: 'Point', coordinates: [incident.location.lng, incident.location.lat] },
    }));
    const safetyFeatures = [...hazardFeatures, ...incidentFeatures];

    if (map.getSource('hazard-source')) {
      (map.getSource('hazard-source') as OlaMapsWeb.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: safetyFeatures,
      });
    } else {
      map.addSource('hazard-source', { type: 'geojson', data: { type: 'FeatureCollection', features: safetyFeatures } });
    }

    if (!map.getLayer('hazard-points')) {
      map.addLayer({
        id: 'hazard-points',
        type: 'circle',
        source: 'hazard-source',
        paint: {
          'circle-radius': 7,
          'circle-color': [
            'match', ['get', 'severity'],
            'HIGH', '#ef4444',
            'MEDIUM', '#f59e0b',
            '#22c55e',
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
    }

    if (!map.getLayer('hazard-labels')) {
      map.addLayer({
        id: 'hazard-labels',
        type: 'symbol',
        source: 'hazard-source',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-offset': [0, 1.35],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#0f172a',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        },
      });
    }
  }, [mapReady, route, roadCondition, traffic, riskLevel, apiKey]);

  // Separate effect: clear map when route is removed
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    if (!route) {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (map.getLayer('route-line')) map.removeLayer('route-line');
      if (map.getSource('route-source')) map.removeSource('route-source');
      if (map.getLayer('hazard-labels')) map.removeLayer('hazard-labels');
      if (map.getLayer('hazard-points')) map.removeLayer('hazard-points');
      if (map.getSource('hazard-source')) map.removeSource('hazard-source');
      map.flyTo({ center: INDIA_CENTER, zoom: 4.8, essential: true });
    }
  }, [mapReady, route]);

  return (
    <div className="relative h-full w-full min-h-[320px] sm:min-h-[400px]">
      <div ref={mapContainerRef} className="h-full w-full rounded-lg" />

      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/90 p-6 text-center">
          <div>
            <p className="text-sm font-medium text-foreground">Ola Maps could not load</p>
            <p className="mt-1 text-xs text-muted-foreground">{mapError}</p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-sm">
          <div className="text-center">
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Analyzing live route and traffic</p>
          </div>
        </div>
      )}

      {!route && !isLoading && !mapError && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="rounded-xl border border-border bg-card/90 p-6 text-center shadow-lg backdrop-blur-sm">
            <p className="text-sm font-medium text-foreground">Ola Maps is ready</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Search for origin and destination to render live route guidance
            </p>
          </div>
        </div>
      )}

      {route && !isLoading && (
        <div className="absolute right-2 top-2 z-10 max-w-[calc(100%-1rem)] rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur-sm sm:right-4 sm:top-4 sm:min-w-[180px] sm:p-4">
          <div className="space-y-2 sm:space-y-3">
            <div>
              <div className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground">Distance</div>
              <div className="text-base sm:text-lg font-semibold text-foreground">{route.distance}</div>
            </div>
            <div>
              <div className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground">Traffic Aware ETA</div>
              <div className="text-base sm:text-lg font-semibold text-foreground">{route.duration}</div>
            </div>
            {riskLevel && (
              <div>
                <div className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground">Risk Level</div>
                <div
                  className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs sm:text-sm font-semibold"
                  style={{
                    color: riskColors[riskLevel],
                    backgroundColor: `${riskColors[riskLevel]}20`,
                  }}
                >
                  {riskLevel}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
