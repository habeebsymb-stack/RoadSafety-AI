// Road Safety AI — Route Tool
// Fetches real route data using TomTom, Ola Maps, or Google Maps
// TomTom provides superior real-time traffic and accurate road-following routes
// Includes retry logic and graceful fallback

import axios from 'axios';
import type { RouteData, Coordinates } from '@/lib/types';
import { cache, routeCacheKey } from '@/lib/services/cache';

const OLA_BASE = 'https://api.olamaps.io';
const GOOGLE_BASE = 'https://maps.googleapis.com/maps/api';
const TOMTOM_BASE = 'https://api.tomtom.com/routing/1';
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

// ─── Geocoding ───────────────────────────────────────────────────────────────

/**
 * Geocode a place name to coordinates using Ola Maps or Google Maps.
 */
async function geocodeLocation(address: string): Promise<Coordinates> {
  const cacheKey = `geocode:${address.toLowerCase().trim()}`;
  const cached = cache.get<Coordinates>(cacheKey);
  if (cached) {
    console.log(`[RouteTool] Cache hit: geocode "${address}"`);
    return cached;
  }

  const useGoogle = process.env.USE_GOOGLE_MAPS === 'true';

  if (useGoogle) {
    return geocodeGoogle(address, cacheKey);
  }
  return geocodeOla(address, cacheKey);
}

async function geocodeOla(address: string, cacheKey: string): Promise<Coordinates> {
  const apiKey = process.env.OLA_MAPS_API_KEY;
  if (!apiKey) throw new Error('OLA_MAPS_API_KEY not configured');

  try {
    console.log(`[RouteTool] Resolving "${address}" via Ola Maps autocomplete...`);
    const autocompleteResponse = await axios.get(`${OLA_BASE}/places/v1/autocomplete`, {
      params: { input: address, api_key: apiKey },
      timeout: 8000,
    });

    const predictions = autocompleteResponse.data?.predictions;
    const topPrediction = Array.isArray(predictions) ? predictions[0] : null;
    const predictionLocation = topPrediction?.geometry?.location;
    if (predictionLocation?.lat && predictionLocation?.lng) {
      const coords: Coordinates = { lat: predictionLocation.lat, lng: predictionLocation.lng };
      cache.set(cacheKey, coords, 60 * 60 * 1000);
      return coords;
    }

    console.log(`[RouteTool] Autocomplete empty, trying geocode for "${address}"...`);
    const geocodeResponse = await axios.get(`${OLA_BASE}/places/v1/geocode`, {
      params: { address, language: 'English', api_key: apiKey },
      timeout: 8000,
    });

    const results = geocodeResponse.data?.geocodingResults || geocodeResponse.data?.results;
    const loc = results?.[0]?.geometry?.location || results?.[0]?.location;
    if (!loc?.lat || !loc?.lng) {
      throw new Error(`No geocoding result for "${address}"`);
    }

    const coords: Coordinates = { lat: loc.lat, lng: loc.lng };
    cache.set(cacheKey, coords, 60 * 60 * 1000);
    return coords;
  } catch (err) {
    console.warn(`[RouteTool] Ola geocode failed for "${address}":`, err instanceof Error ? err.message : err);
    // Fall back to a rough India-centered coordinate derivation
    return getFallbackCoords(address);
  }
}

async function geocodeGoogle(address: string, cacheKey: string): Promise<Coordinates> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY not configured');

  console.log(`[RouteTool] Geocoding "${address}" via Google Maps...`);
  const response = await axios.get(`${GOOGLE_BASE}/geocode/json`, {
    params: { address, key: apiKey },
    timeout: 8000,
  });

  if (response.data.status !== 'OK' || !response.data.results.length) {
    throw new Error(`Google geocode failed for "${address}": ${response.data.status}`);
  }

  const loc = response.data.results[0].geometry.location;
  const coords: Coordinates = { lat: loc.lat, lng: loc.lng };
  cache.set(cacheKey, coords, 60 * 60 * 1000);
  return coords;
}

// ─── Route Directions ─────────────────────────────────────────────────────────

/**
 * Main tool function: fetch real route data between two locations.
 * Priority: TomTom → Ola Maps → Google Maps → Fallback
 */
export async function getRouteData(
  origin: string,
  destination: string,
  originCoords?: Coordinates,
  destCoords?: Coordinates
): Promise<RouteData> {
  const cacheKey = buildRouteCacheKey(origin, destination, originCoords, destCoords);
  const cached = cache.get<RouteData>(cacheKey);
  if (cached && !isCollapsedRoute(cached)) {
    console.log(`[RouteTool] Cache hit: route "${origin}" → "${destination}"`);
    return cached;
  }
  if (cached) {
    console.warn('[RouteTool] Ignoring cached route because origin/destination collapsed to one point');
    cache.delete(cacheKey);
  }

  // Try providers in priority order: TomTom > Ola > Google > OSRM > fallback
  const hasTomTom = !!process.env.TOMTOM_API_KEY;
  const hasOla = !!process.env.OLA_MAPS_API_KEY;
  const useGoogle = process.env.USE_GOOGLE_MAPS === 'true' && !!process.env.GOOGLE_MAPS_API_KEY;

  // 1. Try TomTom first (best routing + real-time traffic for India)
  if (hasTomTom) {
    try {
      const route = await fetchRouteTomTom(origin, destination, originCoords, destCoords);
      cache.set(cacheKey, route, 5 * 60 * 1000);
      return route;
    } catch (err) {
      console.error('[RouteTool] TomTom FAILED:', err instanceof Error ? err.message : err);
    }
  }

  // 2. Fall back to Ola Maps
  if (hasOla) {
    try {
      const route = await fetchRouteOla(origin, destination, originCoords, destCoords);
      cache.set(cacheKey, route, 5 * 60 * 1000);
      return route;
    } catch (err) {
      console.error('[RouteTool] Ola Maps FAILED:', err instanceof Error ? err.message : err);
    }
  }

  // 3. Try Google Maps
  if (useGoogle) {
    try {
      const route = await fetchRouteGoogle(origin, destination, originCoords, destCoords);
      cache.set(cacheKey, route, 5 * 60 * 1000);
      return route;
    } catch (err) {
      console.error('[RouteTool] Google Maps FAILED:', err instanceof Error ? err.message : err);
    }
  }

  // 4. Use OSRM as a road-network geometry fallback when paid providers cannot route.
  // This prevents the map from drawing misleading straight lines through non-road areas.
  try {
    const route = await fetchRouteOsrm(origin, destination, originCoords, destCoords);
    cache.set(cacheKey, route, 5 * 60 * 1000);
    return route;
  } catch (err) {
    console.error('[RouteTool] OSRM FAILED:', err instanceof Error ? err.message : err);
  }

  // 5. Last resort: interpolated fallback (will be a straight-ish line)
  console.warn('[RouteTool] All routing providers failed, using fallback interpolation');
  return buildFallbackRoute(origin, destination, originCoords, destCoords);
}

async function fetchRouteTomTom(
  origin: string,
  destination: string,
  originCoords?: Coordinates,
  destCoords?: Coordinates
): Promise<RouteData> {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) throw new Error('TOMTOM_API_KEY not configured');

  // Use pre-resolved coordinates if available, otherwise geocode
  const [resolvedOrigin, resolvedDest] = await Promise.all([
    originCoords ? Promise.resolve(originCoords) : geocodeLocation(origin),
    destCoords ? Promise.resolve(destCoords) : geocodeLocation(destination),
  ]);

  console.log(`[RouteTool] Fetching TomTom directions: ${origin} → ${destination}`);
  console.log(`[RouteTool] TomTom coords: origin=${resolvedOrigin.lat},${resolvedOrigin.lng} dest=${resolvedDest.lat},${resolvedDest.lng}`);

  // Step 2: Fetch directions with real-time traffic
  // Using calculateRoute endpoint with full path geometry
  const response = await axios.get(
    `${TOMTOM_BASE}/calculateRoute/${resolvedOrigin.lat},${resolvedOrigin.lng}:${resolvedDest.lat},${resolvedDest.lng}/json`,
    {
      params: {
        key: apiKey,
        routeType: 'fastest',
        traffic: true,
        avoid: 'unpavedRoads',
        travelMode: 'car',
        language: 'en-GB',
        instructionsType: 'coded',
        sectionType: 'travelMode,traffic',
        // Request detailed geometry for accurate road-following route
        representations: 'polyline',
        computeBestOrder: false,
        maxAlternatives: 0,
      },
      timeout: 15000,
    }
  );

  const routes = response.data?.routes;
  if (!routes || routes.length === 0) {
    throw new Error('No routes returned from TomTom');
  }

  const routeData = routes[0];
  const summary = routeData.summary;
  const legs = routeData.legs || [];

  if (!summary) throw new Error('No summary in TomTom route');

  // Distance in meters, convert to km
  const distanceM = summary.lengthInMeters || 0;
  // Duration in seconds (traffic-aware)
  const durationS = summary.travelTimeInSeconds || summary.liveTrafficIncidentsTravelTimeInSeconds || 0;
  // Traffic delay in seconds
  const trafficDelayS = summary.trafficDelayInSeconds || 0;

  // Extract waypoints from TomTom — TomTom returns a 'shape' field (polyline) in the response
  let waypoints: Coordinates[] = [];

  // TomTom provides points in routeData.shape as an encoded polyline
  if (routeData.shape) {
    waypoints = decodePolyline(routeData.shape);
    console.log(`[RouteTool] TomTom returned ${waypoints.length} waypoints from shape (polyline)`);
  }
  // Also try legs[0].points (TomTom sometimes provides raw lat/lon array)
  else if (legs?.[0]?.points && legs[0].points.length > 0) {
    waypoints = legs[0].points.map((p: { lat: number; lon: number }) => ({
      lat: p.lat,
      lng: p.lon,
    }));
    console.log(`[RouteTool] TomTom returned ${waypoints.length} waypoints from points array`);
  }

  // If no detailed geometry, fall back to interpolation (shouldn't happen with TomTom)
  if (waypoints.length < 2) {
    console.warn('[RouteTool] TomTom returned insufficient waypoints, using fallback interpolation');
    waypoints = interpolateWaypoints(resolvedOrigin, resolvedDest, 20);
  }

  // Build encoded polyline from waypoints for display
  const polyline = encodePolyline(waypoints);

  console.log(`[RouteTool] ✓ TomTom Route: ${(distanceM / 1000).toFixed(1)} km, ${Math.round(durationS / 60)} min, ${waypoints.length} waypoints`);

  return {
    origin: { address: origin, coordinates: resolvedOrigin },
    destination: { address: destination, coordinates: resolvedDest },
    distance: `${(distanceM / 1000).toFixed(1)} km`,
    duration: formatDuration(durationS),
    polyline,
    waypoints,
    trafficDelayMinutes: Math.round(trafficDelayS / 60),
  };
}

async function fetchRouteOla(
  origin: string,
  destination: string,
  originCoords?: Coordinates,
  destCoords?: Coordinates
): Promise<RouteData> {
  const apiKey = process.env.OLA_MAPS_API_KEY;
  if (!apiKey) throw new Error('OLA_MAPS_API_KEY not configured');

  // Use pre-resolved coordinates if available, otherwise geocode
  const [resolvedOrigin, resolvedDest] = await Promise.all([
    originCoords ? Promise.resolve(originCoords) : geocodeLocation(origin),
    destCoords ? Promise.resolve(destCoords) : geocodeLocation(destination),
  ]);

  console.log(`[RouteTool] Fetching Ola Maps directions: ${origin} → ${destination}`);
  console.log(`[RouteTool] Ola coords: origin=${resolvedOrigin.lat},${resolvedOrigin.lng} dest=${resolvedDest.lat},${resolvedDest.lng}`);

  // Try GET request with query params (matching TrafficFlow AI reference)
  let responseData: Record<string, unknown> | null = null;
  let fetchError = '';

  try {
    const getResponse = await axios.get(`${OLA_BASE}/routing/v1/directions`, {
      params: {
        api_key: apiKey,
        origin: `${resolvedOrigin.lat},${resolvedOrigin.lng}`,
        destination: `${resolvedDest.lat},${resolvedDest.lng}`,
      },
      timeout: 12000,
    });
    responseData = getResponse.data;
    console.log(`[RouteTool] Ola Maps GET response keys: ${Object.keys(responseData || {}).join(', ')}`);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
    console.warn(`[RouteTool] Ola Maps GET failed: ${fetchError}`);
  }

  // If GET failed, try POST with JSON body
  if (!responseData || !Array.isArray((responseData as Record<string, unknown>)?.routes) || !((responseData as Record<string, unknown>)?.routes as unknown[])?.length) {
    try {
      const postResponse = await axios.post(
        `${OLA_BASE}/routing/v1/directions?api_key=${apiKey}`,
        {
          origin: { lat: resolvedOrigin.lat, lng: resolvedOrigin.lng },
          destination: { lat: resolvedDest.lat, lng: resolvedDest.lng },
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 12000,
        }
      );
      responseData = postResponse.data;
      console.log(`[RouteTool] Ola Maps POST response keys: ${Object.keys(responseData || {}).join(', ')}`);
    } catch (err) {
      console.warn(`[RouteTool] Ola Maps POST also failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (!responseData) {
    throw new Error(`Ola Maps fetch failed. GET: ${fetchError}`);
  }

  // Try multiple response format patterns
  let routeData = (responseData as Record<string, unknown>)?.routes as unknown;
  if (Array.isArray(routeData) && routeData.length > 0) {
    routeData = routeData[0] as Record<string, unknown>;
  } else {
    routeData = undefined;
  }
  let legs = (routeData as Record<string, unknown>)?.legs as Array<Record<string, unknown>> | undefined;

  if (!routeData) {
    console.error('[RouteTool] Ola Maps full response:', JSON.stringify(responseData).slice(0, 500));
    throw new Error('No routes returned from Ola Maps');
  }

  // Try multiple polyline field patterns
  let polylineString =
    ((routeData as Record<string, unknown>)?.overview_polyline as Record<string, unknown>)?.points as string ||
    ((routeData as Record<string, unknown>)?.overview_polyline as Record<string, unknown>)?.encoded_polyline as string ||
    (routeData as Record<string, unknown>)?.overview_polyline as string ||
    '';

  // Also try to extract from legs/steps if overview is missing
  if (!polylineString && legs?.[0]?.steps) {
    const steps = legs[0].steps as Array<Record<string, unknown>>;
    for (const step of steps) {
      const stepPolyline = (step.polyline as Record<string, unknown>)?.points as string ||
        (step.polyline as Record<string, unknown>)?.encoded_polyline as string ||
        step.polyline as string || '';
      if (stepPolyline) {
        polylineString = stepPolyline;
        break;
      }
    }
  }

  const leg = legs?.[0];
  if (!leg) throw new Error('No leg data in route');

  const distanceM: number = (leg.distance as { value?: number })?.value || (leg.distance as number) || 0;
  const durationS: number = (leg.duration as { value?: number })?.value || (leg.duration as number) || 0;

  // Extract waypoints - prioritize decoded polyline for road-following route
  let waypoints: Coordinates[] = [];

  if (polylineString) {
    waypoints = decodePolyline(polylineString);
    console.log(`[RouteTool] Ola Maps: decoded ${waypoints.length} waypoints from polyline`);
  }

  // Fallback: if polyline decoding fails or returns few points, use steps
  if (waypoints.length < 10) {
    console.warn('[RouteTool] Ola Maps polyline insufficient, falling back to steps');
    const steps = Array.isArray(leg.steps) ? leg.steps : [];
    waypoints = steps
      .filter((step: Record<string, unknown>) => step.start_location || step.end_location)
      .map((step: Record<string, unknown>) => {
        const loc = (step.start_location as { lat?: number; lng?: number }) ||
                   (step.end_location as { lat?: number; lng?: number });
        return loc?.lat && loc?.lng ? { lat: loc.lat, lng: loc.lng } : resolvedOrigin;
      });
    // Ensure we have at least origin and destination
    if (waypoints.length === 0) {
      waypoints = [resolvedOrigin, resolvedDest];
    }
  }

  console.log(`[RouteTool] ✓ Ola Route: ${(distanceM / 1000).toFixed(1)} km, ${Math.round(durationS / 60)} min, ${waypoints.length} waypoints`);

  return {
    origin: { address: origin, coordinates: resolvedOrigin },
    destination: { address: destination, coordinates: resolvedDest },
    distance: `${(distanceM / 1000).toFixed(1)} km`,
    duration: formatDuration(durationS),
    polyline: polylineString,
    waypoints,
  };
}

async function fetchRouteGoogle(
  origin: string,
  destination: string,
  originCoords?: Coordinates,
  destCoords?: Coordinates
): Promise<RouteData> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY not configured');

  console.log(`[RouteTool] Fetching Google Maps directions: ${origin} → ${destination}`);

  // Use coordinates if provided, otherwise use text addresses
  const originParam = originCoords ? `${originCoords.lat},${originCoords.lng}` : origin;
  const destParam = destCoords ? `${destCoords.lat},${destCoords.lng}` : destination;

  const response = await axios.get(`${GOOGLE_BASE}/directions/json`, {
    params: {
      origin: originParam,
      destination: destParam,
      key: apiKey,
      mode: 'driving',
      departure_time: 'now',
      traffic_model: 'best_guess',
      language: 'en',
    },
    timeout: 12000,
  });

  if (response.data.status !== 'OK') {
    throw new Error(`Google Directions API error: ${response.data.status}`);
  }

  const route = response.data.routes[0];
  const leg = route.legs[0];

  const resolvedOrigin: Coordinates = originCoords || {
    lat: leg.start_location.lat,
    lng: leg.start_location.lng,
  };
  const resolvedDest: Coordinates = destCoords || {
    lat: leg.end_location.lat,
    lng: leg.end_location.lng,
  };

  // Decode Google Maps polyline for detailed road-following geometry
  let waypoints: Coordinates[] = [];
  const polylineString = route.overview_polyline?.points;

  if (polylineString) {
    waypoints = decodePolyline(polylineString);
    console.log(`[RouteTool] Google Maps: decoded ${waypoints.length} waypoints from polyline`);
  }

  // Fallback: if polyline fails, use steps
  if (waypoints.length < 10) {
    console.warn('[RouteTool] Google Maps polyline insufficient, falling back to steps');
    waypoints = leg.steps.map((step: { start_location: { lat: number; lng: number } }) => ({
      lat: step.start_location.lat,
      lng: step.start_location.lng,
    }));
  }

  console.log(`[RouteTool] ✓ Google Route: ${leg.distance.text}, ${leg.duration_in_traffic?.text || leg.duration.text}, ${waypoints.length} waypoints`);

  return {
    origin: { address: origin, coordinates: resolvedOrigin },
    destination: { address: destination, coordinates: resolvedDest },
    distance: leg.distance.text,
    duration: leg.duration_in_traffic?.text || leg.duration.text,
    polyline: polylineString || '',
    waypoints,
  };
}

async function fetchRouteOsrm(
  origin: string,
  destination: string,
  originCoords?: Coordinates,
  destCoords?: Coordinates
): Promise<RouteData> {
  const [resolvedOrigin, resolvedDest] = await Promise.all([
    originCoords ? Promise.resolve(originCoords) : geocodeLocation(origin),
    destCoords ? Promise.resolve(destCoords) : geocodeLocation(destination),
  ]);

  if (haversineKm(resolvedOrigin, resolvedDest) < 0.1) {
    throw new Error('Origin and destination resolved to nearly the same coordinate');
  }

  console.log(`[RouteTool] Fetching OSRM road geometry: ${origin} -> ${destination}`);
  const response = await axios.get(
    `${OSRM_BASE}/${resolvedOrigin.lng},${resolvedOrigin.lat};${resolvedDest.lng},${resolvedDest.lat}`,
    {
      params: {
        overview: 'full',
        geometries: 'geojson',
        steps: false,
        alternatives: false,
      },
      timeout: 15000,
    }
  );

  if (response.data?.code !== 'Ok') {
    throw new Error(`OSRM route error: ${response.data?.code || 'UNKNOWN'}`);
  }

  const route = response.data?.routes?.[0];
  const rawCoords = route?.geometry?.coordinates;
  const waypoints: Coordinates[] = Array.isArray(rawCoords)
    ? rawCoords.flatMap((coord: unknown) => {
        if (!Array.isArray(coord) || typeof coord[0] !== 'number' || typeof coord[1] !== 'number') {
          return [];
        }
        return [{ lat: coord[1], lng: coord[0] }];
      })
    : [];

  if (waypoints.length < 2) {
    throw new Error('OSRM returned insufficient route geometry');
  }

  const distanceM = typeof route?.distance === 'number' ? route.distance : haversineKm(resolvedOrigin, resolvedDest) * 1000;
  const durationS = typeof route?.duration === 'number' ? route.duration : (distanceM / 1000 / 35) * 3600;
  const polyline = encodePolyline(waypoints);

  console.log(`[RouteTool] OSRM Route: ${(distanceM / 1000).toFixed(1)} km, ${Math.round(durationS / 60)} min, ${waypoints.length} waypoints`);

  return {
    origin: { address: origin, coordinates: resolvedOrigin },
    destination: { address: destination, coordinates: resolvedDest },
    distance: `${(distanceM / 1000).toFixed(1)} km`,
    duration: formatDuration(durationS),
    polyline,
    waypoints,
  };
}

// ─── TomTom Geometry Helpers ──────────────────────────────────────────────────

/**
 * Extract waypoints from TomTom route geometry.
 * TomTom provides detailed point data that follows actual roads.
 */
function extractWaypointsFromTomTomGeometry(
  routeData: {
    legs?: Array<{
      points?: Array<{ latitude: number; longitude: number }>;
      steps?: Array<{
        points?: Array<{ latitude: number; longitude: number }>;
      }>;
    }>;
  },
  origin: Coordinates,
  dest: Coordinates
): Coordinates[] {
  const points: Coordinates[] = [];

  // Add origin as first point
  points.push(origin);

  // Extract points from legs if available
  if (routeData.legs && routeData.legs.length > 0) {
    for (const leg of routeData.legs) {
      // TomTom provides points array in the leg
      if (leg.points && leg.points.length > 0) {
        for (const point of leg.points) {
          points.push({
            lat: point.latitude,
            lng: point.longitude,
          });
        }
      }
      // Alternative: extract from steps
      else if (leg.steps) {
        for (const step of leg.steps) {
          if (step.points && step.points.length > 0) {
            for (const point of step.points) {
              points.push({
                lat: point.latitude,
                lng: point.longitude,
              });
            }
          }
        }
      }
    }
  }

  // Add destination as last point (if not already there)
  const lastPoint = points[points.length - 1];
  if (!lastPoint || lastPoint.lat !== dest.lat || lastPoint.lng !== dest.lng) {
    points.push(dest);
  }

  return points;
}

/**
 * Google Polyline Decoding Algorithm.
 * Decodes a polyline string into an array of coordinates.
 */
function decodePolyline(encoded: string): Coordinates[] {
  if (!encoded) return [];

  const coordinates: Coordinates[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    // Decode latitude
    let shift = 0;
    let result = 0;
    let byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += deltaLat;

    // Decode longitude
    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += deltaLng;

    coordinates.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
    });
  }

  return coordinates;
}

/**
 * Interpolate waypoints between two coordinates.
 * Used as fallback when no detailed route geometry is available.
 */
function interpolateWaypoints(
  origin: Coordinates,
  dest: Coordinates,
  numPoints: number
): Coordinates[] {
  const points: Coordinates[] = [origin];

  for (let i = 1; i < numPoints; i++) {
    const t = i / numPoints;
    points.push({
      lat: origin.lat + (dest.lat - origin.lat) * t,
      lng: origin.lng + (dest.lng - origin.lng) * t,
    });
  }

  points.push(dest);
  return points;
}

/**
 * Google Polyline Encoding Algorithm.
 * Encodes an array of coordinates into a polyline string.
 */
function encodePolyline(coordinates: Coordinates[]): string {
  if (coordinates.length === 0) return '';

  let result = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const coord of coordinates) {
    // Convert to integer values (multiply by 1e5)
    const lat = Math.round(coord.lat * 1e5);
    const lng = Math.round(coord.lng * 1e5);

    // Encode latitude delta
    result += encodeSignedNumber(lat - prevLat);
    // Encode longitude delta
    result += encodeSignedNumber(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return result;
}

function encodeSignedNumber(num: number): string {
  const shifted = num < 0 ? ~(num << 1) : num << 1;
  return encodeUnsignedNumber(shifted);
}

function encodeUnsignedNumber(num: number): string {
  let result = '';
  let n = num;

  while (n >= 0x20) {
    result += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    n >>= 5;
  }

  result += String.fromCharCode(n + 63);
  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractWaypointsFromSteps(
  steps: Array<{ start_location?: { lat: number; lng: number } }>,
  origin: Coordinates,
  dest: Coordinates
): Coordinates[] {
  const points: Coordinates[] = [origin];

  for (const step of steps) {
    if (step.start_location) {
      points.push({ lat: step.start_location.lat, lng: step.start_location.lng });
    }
  }

  points.push(dest);
  return points;
}

function buildRouteCacheKey(
  origin: string,
  destination: string,
  originCoords?: Coordinates,
  destCoords?: Coordinates
): string {
  const baseKey = `${routeCacheKey(origin, destination)}:road-v2`;
  if (!originCoords && !destCoords) return baseKey;

  const coordKey = [originCoords, destCoords]
    .map((coords) => coords ? `${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}` : 'text')
    .join(':');

  return `${baseKey}:${coordKey}`;
}

function isCollapsedRoute(route: RouteData): boolean {
  return haversineKm(route.origin.coordinates, route.destination.coordinates) < 0.1;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes} mins`;
}

// Well-known Indian city coordinates for geocode fallback
const INDIA_CITY_COORDS: Record<string, Coordinates> = {
  delhi: { lat: 28.6139, lng: 77.209 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  kolkata: { lat: 22.5726, lng: 88.3639 },
  pune: { lat: 18.5204, lng: 73.8567 },
  ahmedabad: { lat: 23.0225, lng: 72.5714 },
  jaipur: { lat: 26.9124, lng: 75.7873 },
  lucknow: { lat: 26.8467, lng: 80.9462 },
  agra: { lat: 27.1767, lng: 78.0081 },
  surat: { lat: 21.1702, lng: 72.8311 },
  nagpur: { lat: 21.1458, lng: 79.0882 },
  indore: { lat: 22.7196, lng: 75.8577 },
  bhopal: { lat: 23.2599, lng: 77.4126 },
  chandigarh: { lat: 30.7333, lng: 76.7794 },
  amritsar: { lat: 31.634, lng: 74.8723 },
  kochi: { lat: 9.9312, lng: 76.2673 },
  goa: { lat: 15.2993, lng: 74.124 },
  varanasi: { lat: 25.3176, lng: 82.9739 },
  coimbatore: { lat: 11.0168, lng: 76.9558 },
  mysore: { lat: 12.2958, lng: 76.6394 },
  mysuru: { lat: 12.2958, lng: 76.6394 },
  patna: { lat: 25.5941, lng: 85.1376 },
  bandra: { lat: 19.0596, lng: 72.8295 },
  whitefield: { lat: 12.9698, lng: 77.7499 },
  'india gate': { lat: 28.6129, lng: 77.2295 },
  'connaught place': { lat: 28.6328, lng: 77.2197 },
  'salt lake': { lat: 22.5825, lng: 88.4154 },
  'mg road': { lat: 12.9757, lng: 77.6095 },
};

function getFallbackCoords(address: string): Coordinates {
  const lower = address.toLowerCase();
  for (const [key, coords] of Object.entries(INDIA_CITY_COORDS)) {
    if (lower.includes(key)) return coords;
  }
  // Generate pseudo-random coordinates based on address hash
  // This ensures different addresses get different coordinates
  let hash = 0;
  for (let i = 0; i < lower.length; i++) {
    hash = ((hash << 5) - hash + lower.charCodeAt(i)) & 0xffffffff;
  }
  // Generate coordinates within India bounds with some spread
  const lat = 8 + (hash % 1000) / 1000 * (37 - 8); // 8°N to 37°N
  const lng = 68 + (hash % 1000) / 1000 * (97 - 68); // 68°E to 97°E
  console.warn(`[RouteTool] Unknown location "${address}" — using generated coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
  return { lat, lng };
}

async function buildFallbackRoute(
  origin: string,
  destination: string,
  originCoords?: Coordinates,
  destCoords?: Coordinates
): Promise<RouteData> {
  console.log('[RouteTool] Building fallback route from known coordinates...');
  const resolvedOrigin = originCoords || getFallbackCoords(origin);
  const resolvedDest = destCoords || getFallbackCoords(destination);

  // Estimate distance using Haversine formula
  const distKm = haversineKm(resolvedOrigin, resolvedDest);
  const avgSpeedKmh = 40; // Conservative Indian city driving speed
  const durationMins = Math.round((distKm / avgSpeedKmh) * 60);

  // Generate interpolated waypoints along the route
  const waypoints: Coordinates[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    waypoints.push({
      lat: resolvedOrigin.lat + (resolvedDest.lat - resolvedOrigin.lat) * t,
      lng: resolvedOrigin.lng + (resolvedDest.lng - resolvedOrigin.lng) * t,
    });
  }

  return {
    origin: { address: origin, coordinates: resolvedOrigin },
    destination: { address: destination, coordinates: resolvedDest },
    distance: `${distKm.toFixed(1)} km`,
    duration: formatDuration(durationMins * 60),
    polyline: '',
    waypoints,
  };
}

function haversineKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
