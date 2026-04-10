// Road Safety AI — Road Condition Tool
// Analyzes road infrastructure quality using OpenStreetMap Overpass API
// Falls back to route-length and time-based heuristics if OSM is unavailable

import axios from 'axios';
import type { RoadCondition, RouteData, RoadHazard } from '@/lib/types';
import { cache } from '@/lib/services/cache';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Main tool: assess road condition along a route.
 * Uses OSM Overpass API to query road surface/type tags.
 */
export async function getRoadCondition(route: RouteData): Promise<RoadCondition> {
  const { origin, destination, waypoints } = route;

  // Build bbox from waypoints
  const lats = waypoints.map(w => w.lat);
  const lngs = waypoints.map(w => w.lng);
  const bbox = {
    minLat: Math.min(...lats) - 0.01,
    maxLat: Math.max(...lats) + 0.01,
    minLng: Math.min(...lngs) - 0.01,
    maxLng: Math.max(...lngs) + 0.01,
  };

  const cacheKey = `road:${bbox.minLat.toFixed(2)}:${bbox.minLng.toFixed(2)}:${bbox.maxLat.toFixed(2)}:${bbox.maxLng.toFixed(2)}`;
  const cached = cache.get<RoadCondition>(cacheKey);
  if (cached) {
    console.log('[RoadTool] Cache hit: road condition');
    return cached;
  }

  try {
    const osmData = await fetchOSMRoads(bbox);
    const condition = analyzeOSMRoads(osmData, route);

    cache.set(cacheKey, condition, 15 * 60 * 1000); // Road data changes slowly — 15min cache
    console.log(`[RoadTool] ✓ Road quality: ${condition.quality} (infra score: ${condition.infrastructureScore})`);
    return condition;
  } catch (err) {
    console.warn('[RoadTool] OSM query failed, using route heuristics:', err instanceof Error ? err.message : err);
    return buildHeuristicCondition(route);
  }
}

// ─── OSM Overpass Query ───────────────────────────────────────────────────────

async function fetchOSMRoads(bbox: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}) {
  // Limit bbox to avoid huge queries
  const latSpan = bbox.maxLat - bbox.minLat;
  const lngSpan = bbox.maxLng - bbox.minLng;
  if (latSpan > 2 || lngSpan > 2) {
    throw new Error('Route bbox too large for OSM query — using heuristics');
  }

  const query = `
    [out:json][timeout:10];
    way["highway"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
    out tags;
  `;

  console.log('[RoadTool] Querying OpenStreetMap road data...');
  const response = await axios.post(OVERPASS_URL, query, {
    headers: { 'Content-Type': 'text/plain' },
    timeout: 12000,
  });

  return response.data;
}

type OSMWay = {
  tags: {
    highway?: string;
    surface?: string;
    smoothness?: string;
    maxspeed?: string;
    lanes?: string;
    lit?: string;
    access?: string;
  };
};

function analyzeOSMRoads(osmData: { elements?: OSMWay[] }, route: RouteData): RoadCondition {
  const ways: OSMWay[] = osmData.elements || [];

  if (ways.length === 0) {
    return buildHeuristicCondition(route);
  }

  let qualityScore = 0;
  let lightingScore = 0;
  let wayCount = 0;

  for (const way of ways) {
    const tags = way.tags || {};
    if (!tags.highway) continue;

    wayCount++;

    // Highway type score (higher = better infrastructure)
    const highwayScore: Record<string, number> = {
      motorway: 95,
      trunk: 88,
      primary: 78,
      secondary: 65,
      tertiary: 52,
      residential: 45,
      unclassified: 38,
      service: 35,
      track: 15,
      path: 10,
    };
    qualityScore += highwayScore[tags.highway] ?? 40;

    // Surface condition
    const surfaceScore: Record<string, number> = {
      asphalt: 90,
      concrete: 85,
      paved: 80,
      compacted: 55,
      gravel: 35,
      ground: 25,
      dirt: 15,
      unpaved: 20,
      sand: 10,
    };
    if (tags.surface) qualityScore += (surfaceScore[tags.surface] ?? 50) - 50; // Adjust from baseline

    // Smoothness
    const smoothnessScore: Record<string, number> = {
      excellent: 15,
      good: 10,
      intermediate: 0,
      bad: -15,
      very_bad: -30,
      horrible: -50,
    };
    if (tags.smoothness) qualityScore += smoothnessScore[tags.smoothness] ?? 0;

    // Lighting
    if (tags.lit === 'yes') lightingScore += 1;
    else if (tags.lit === 'no') lightingScore -= 1;
  }

  if (wayCount === 0) return buildHeuristicCondition(route);

  const avgQuality = Math.max(0, Math.min(100, qualityScore / wayCount));
  const litRatio = wayCount > 0 ? lightingScore / wayCount : 0;

  const quality = scoreToQuality(avgQuality);
  const hour = new Date().getHours();
  const isDark = hour < 6 || hour >= 19;

  const lightingCondition: RoadCondition['lightingCondition'] =
    litRatio > 0.5 ? 'GOOD' : litRatio > 0 ? 'MODERATE' : isDark ? 'POOR' : 'MODERATE';

  const hazards = detectHazardsFromOSM(ways, route);

  return {
    quality,
    hazards,
    infrastructureScore: Math.round(avgQuality),
    lightingCondition,
  };
}

function scoreToQuality(score: number): RoadCondition['quality'] {
  if (score >= 75) return 'GOOD';
  if (score >= 55) return 'FAIR';
  if (score >= 35) return 'POOR';
  return 'VERY_POOR';
}

function detectHazardsFromOSM(ways: OSMWay[], route: RouteData): RoadHazard[] {
  const hazards: RoadHazard[] = [];
  const waypoints = route.waypoints;
  const now = new Date().toISOString();

  let hasNarrow = false;
  let hasPoor = false;
  let hasTracks = false;

  for (const way of ways) {
    const tags = way.tags || {};
    const lanes = parseInt(tags.lanes ?? '2');
    if (lanes === 1 || tags.highway === 'track') {
      hasNarrow = true;
    }
    if (tags.smoothness === 'bad' || tags.smoothness === 'very_bad' || tags.smoothness === 'horrible') {
      hasPoor = true;
    }
    if (tags.highway === 'track' || tags.surface === 'dirt' || tags.surface === 'ground') {
      hasTracks = true;
    }
  }

  const midpoint = waypoints[Math.floor(waypoints.length / 2)] || { lat: 20.5937, lng: 78.9629 };

  if (hasPoor) {
    hazards.push({
      type: 'POTHOLE',
      location: midpoint,
      severity: 'MEDIUM',
      reportedAt: now,
      description: 'Poor road surface detected on route',
    } as RoadHazard);
  }

  if (hasNarrow) {
    hazards.push({
      type: 'NARROW_ROAD',
      location: waypoints[1] || midpoint,
      severity: 'LOW',
      reportedAt: now,
      description: 'Single-lane or narrow road sections on route',
    } as RoadHazard);
  }

  if (hasTracks) {
    hazards.push({
      type: 'SHARP_TURN',
      location: midpoint,
      severity: 'MEDIUM',
      reportedAt: now,
      description: 'Unpaved or rough track sections detected',
    } as RoadHazard);
  }

  return hazards;
}

// ─── Heuristic Fallback ───────────────────────────────────────────────────────

/**
 * Build road condition estimate from route characteristics.
 * Uses distance, region (lat/lng), and time of day — no randomness.
 */
function buildHeuristicCondition(route: RouteData): RoadCondition {
  const distanceKm = parseFloat(route.distance.replace(/[^\d.]/g, '')) || 20;
  const lat = route.origin.coordinates.lat;
  const lng = route.origin.coordinates.lng;
  const hour = new Date().getHours();
  const now = new Date().toISOString();

  // Metro cities have better roads (rough heuristic by known city coords)
  const isMetroCity =
    (lat > 28.4 && lat < 28.8 && lng > 76.8 && lng < 77.6) || // Delhi NCR
    (lat > 12.8 && lat < 13.2 && lng > 77.4 && lng < 77.8) || // Bangalore
    (lat > 18.9 && lat < 19.2 && lng > 72.7 && lng < 73.1) || // Mumbai
    (lat > 17.3 && lat < 17.5 && lng > 78.3 && lng < 78.6); // Hyderabad

  // Longer routes tend to include more highway segments
  const hasHighway = distanceKm > 40;

  let infrastructureScore: number;
  let quality: RoadCondition['quality'];

  if (isMetroCity && hasHighway) {
    infrastructureScore = 78;
    quality = 'GOOD';
  } else if (isMetroCity) {
    infrastructureScore = 62;
    quality = 'FAIR';
  } else if (hasHighway) {
    infrastructureScore = 68;
    quality = 'FAIR';
  } else {
    infrastructureScore = 48;
    quality = 'POOR';
  }

  const isDark = hour < 6 || hour >= 19;
  const lightingCondition: RoadCondition['lightingCondition'] = isMetroCity
    ? isDark ? 'MODERATE' : 'GOOD'
    : isDark ? 'POOR' : 'MODERATE';

  // Detect hazards based on route profile — deterministic, no random
  const hazards: RoadHazard[] = [];
  const midpoint = route.waypoints[Math.floor(route.waypoints.length / 2)] || route.origin.coordinates;

  if (!isMetroCity && !hasHighway) {
    hazards.push({
      type: 'POTHOLE',
      location: midpoint,
      severity: 'MEDIUM',
      reportedAt: now,
      description: 'Typical road surface degradation in non-metro area',
    } as RoadHazard);
  }

  if (isDark && !isMetroCity) {
    hazards.push({
      type: 'PEDESTRIAN_ZONE',
      location: route.waypoints[1] || midpoint,
      severity: 'LOW',
      reportedAt: now,
      description: 'Low street lighting on this part of route',
    } as RoadHazard);
  }

  console.log(`[RoadTool] ✓ Heuristic condition: ${quality} (infra: ${infrastructureScore})`);

  return {
    quality,
    hazards,
    infrastructureScore,
    lightingCondition,
  };
}
