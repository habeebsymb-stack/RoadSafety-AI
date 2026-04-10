// Road Safety AI — Traffic Tool
// Fetches real-time traffic data from TomTom API
// Falls back to speed-based analysis from route data
// Uses time-of-day heuristics as last resort

import axios from 'axios';
import type { TrafficData, RouteData, Coordinates } from '@/lib/types';

const TOMTOM_TRAFFIC_BASE = 'https://api.tomtom.com/traffic/services/4';
const TOMTOM_INCIDENTS_BASE = 'https://api.tomtom.com/traffic/services/5/incidentDetails';
const MAX_TOMTOM_FLOW_SAMPLES = 7;

type TomTomFlowSegment = {
  currentSpeed: number;
  freeFlowSpeed: number;
  currentTravelTime: number;
  freeFlowTravelTime: number;
  confidence: number;
};

/**
 * Main tool: fetch or derive traffic conditions.
 *
 * Strategy:
 * 1. Try TomTom Traffic Flow API for real-time data (if TOMTOM_API_KEY available)
 * 2. Use TomTom traffic delay from route data
 * 3. Fall back to speed-based analysis from route duration
 * 4. Pure time-of-day heuristics as last resort
 */
export async function getTrafficData(route: RouteData): Promise<TrafficData> {
  console.log('[TrafficTool] Analyzing traffic conditions...');

  const timeFactors = getTimeFactors();
  const distanceKm = parseFloat(route.distance.replace(/[^\d.]/g, ''));
  const durationMinutes = parseDurationMinutes(route.duration);

  // 1. Try TomTom real-time traffic if API key available
  const tomTomApiKey = process.env.TOMTOM_API_KEY;
  if (tomTomApiKey && route.waypoints.length >= 2) {
    try {
      const tomTomTraffic = await fetchTomTomTraffic(
        route,
        tomTomApiKey
      );
      if (tomTomTraffic) {
        console.log('[TrafficTool] ✓ Using TomTom real-time traffic data');
        return tomTomTraffic;
      }
    } catch (err) {
      console.warn('[TrafficTool] TomTom traffic fetch failed:', err instanceof Error ? err.message : err);
    }
  }

  // 2. Use TomTom traffic delay from route if available
  if (route.trafficDelayMinutes !== undefined && route.trafficDelayMinutes > 0) {
    return buildFromTrafficDelay(
      route.trafficDelayMinutes,
      distanceKm,
      durationMinutes,
      timeFactors,
      route.waypoints
    );
  }

  // 3. Speed-based analysis
  if (distanceKm > 0 && durationMinutes > 0) {
    const actualSpeedKmh = (distanceKm / durationMinutes) * 60;
    return buildFromSpeed(actualSpeedKmh, distanceKm, durationMinutes, timeFactors, route.waypoints);
  }

  // 4. Pure time-of-day fallback
  return buildTimeOfDayEstimate(timeFactors, route.waypoints);
}

// ─── TomTom Real-Time Traffic ─────────────────────────────────────────────────

async function fetchTomTomTraffic(
  route: RouteData,
  apiKey: string
): Promise<TrafficData | null> {
  const samplePoints = sampleRoutePoints(route.waypoints, MAX_TOMTOM_FLOW_SAMPLES);
  if (samplePoints.length === 0) return null;

  const [flowResults, incidentResults] = await Promise.all([
    Promise.allSettled(samplePoints.map((point) => fetchTomTomFlowSegment(point, apiKey))),
    fetchTomTomIncidents(route.waypoints, apiKey).catch((err) => {
      console.warn('[TrafficTool] TomTom incident details failed:', err instanceof Error ? err.message : err);
      return [];
    }),
  ]);

  const flowSegments = flowResults
    .filter((result): result is PromiseFulfilledResult<TomTomFlowSegment> => result.status === 'fulfilled' && !!result.value)
    .map((result) => result.value);

  if (flowSegments.length === 0) {
    return null;
  }

  const weightedCurrentSpeed = weightedAverage(flowSegments.map((segment) => ({
    value: segment.currentSpeed,
    weight: segment.confidence,
  })));
  const weightedFreeFlowSpeed = weightedAverage(flowSegments.map((segment) => ({
    value: segment.freeFlowSpeed,
    weight: segment.confidence,
  })));
  const speedRatio = weightedFreeFlowSpeed > 0 ? weightedCurrentSpeed / weightedFreeFlowSpeed : 1;
  const flowCongestionScore = scoreFromSpeedRatio(speedRatio);
  const averageDelaySeconds = average(
    flowSegments.map((segment) => Math.max(0, segment.currentTravelTime - segment.freeFlowTravelTime))
  );
  const incidentDelayMinutes = incidentResults.reduce((sum, incident) => {
    return sum + ({ LOW: 2, MEDIUM: 6, HIGH: 12 }[incident.severity]);
  }, 0);
  const incidentCongestionPenalty = incidentResults.reduce((sum, incident) => {
    return sum + ({ LOW: 5, MEDIUM: 12, HIGH: 22 }[incident.severity]);
  }, 0);
  const congestionScore = Math.min(100, flowCongestionScore + incidentCongestionPenalty);
  const congestionLevel = congestionLevelFromScore(congestionScore);

  console.log(
    `[TrafficTool] TomTom realtime: samples=${flowSegments.length}/${samplePoints.length}, score=${congestionScore} (flow=${flowCongestionScore}, incidents=+${incidentCongestionPenalty}), speed=${Math.round(weightedCurrentSpeed)}/${Math.round(weightedFreeFlowSpeed)} km/h`
  );

  return {
    congestionLevel,
    congestionScore,
    averageSpeed: Math.round(weightedCurrentSpeed),
    expectedSpeed: Math.round(weightedFreeFlowSpeed),
    delayMinutes: Math.max(0, Math.round(averageDelaySeconds / 60) + incidentDelayMinutes),
    incidents: incidentResults,
    source: 'TOMTOM_REALTIME',
  };
}

async function fetchTomTomFlowSegment(point: Coordinates, apiKey: string): Promise<TomTomFlowSegment> {
  const response = await axios.get(`${TOMTOM_TRAFFIC_BASE}/flowSegmentData/absolute/10/json`, {
    params: {
      key: apiKey,
      point: `${point.lat},${point.lng}`,
      unit: 'KMPH',
    },
    timeout: 8000,
  });

  const flow = response.data?.flowSegmentData;
  if (!flow) {
    throw new Error('TomTom flow response missing flowSegmentData');
  }

  const currentSpeed = Number(flow.currentSpeed || 0);
  const freeFlowSpeed = Number(flow.freeFlowSpeed || currentSpeed || 0);

  if (currentSpeed <= 0 || freeFlowSpeed <= 0) {
    throw new Error('TomTom flow segment missing usable speed values');
  }

  return {
    currentSpeed,
    freeFlowSpeed,
    currentTravelTime: Number(flow.currentTravelTime || 0),
    freeFlowTravelTime: Number(flow.freeFlowTravelTime || 0),
    confidence: Math.max(0.1, Math.min(1, Number(flow.confidence || 0.75))),
  };
}

async function fetchTomTomIncidents(
  waypoints: Coordinates[],
  apiKey: string
): Promise<TrafficData['incidents']> {
  if (waypoints.length < 2) return [];

  const bbox = routeBoundingBox(waypoints, 0.01);
  const response = await axios.get(TOMTOM_INCIDENTS_BASE, {
    params: {
      key: apiKey,
      bbox: `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
      fields: '{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description,code},from,to}}}',
      language: 'en-GB',
      timeValidityFilter: 'present',
    },
    timeout: 9000,
  });

  const incidents = Array.isArray(response.data?.incidents) ? response.data.incidents : [];
  return incidents
    .map((incident: Record<string, unknown>) => mapTomTomIncident(incident))
    .filter((incident: TrafficData['incidents'][number] | null): incident is TrafficData['incidents'][number] => !!incident)
    .slice(0, 8);
}

function mapTomTomIncident(incident: Record<string, unknown>): TrafficData['incidents'][number] | null {
  const properties = incident.properties as Record<string, unknown> | undefined;
  const geometry = incident.geometry as Record<string, unknown> | undefined;
  const coords = firstIncidentCoordinate(geometry?.coordinates);
  if (!coords) return null;

  const iconCategory = Number(properties?.iconCategory || 0);
  const magnitude = Number(properties?.magnitudeOfDelay || 0);
  const events = Array.isArray(properties?.events) ? properties.events as Array<Record<string, unknown>> : [];
  const eventDescription = events
    .map((event) => event.description)
    .find((description): description is string => typeof description === 'string' && description.length > 0);

  return {
    type: mapTomTomIncidentType(iconCategory),
    location: coords,
    description: eventDescription || `${mapTomTomIncidentType(iconCategory).replace(/_/g, ' ')} reported by TomTom traffic`,
    severity: magnitude >= 3 ? 'HIGH' : magnitude >= 2 ? 'MEDIUM' : 'LOW',
    source: 'TOMTOM_REALTIME',
  };
}

function firstIncidentCoordinate(coordinates: unknown): Coordinates | null {
  if (!Array.isArray(coordinates)) return null;

  if (coordinates.length >= 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    return { lng: coordinates[0], lat: coordinates[1] };
  }

  for (const coord of coordinates) {
    const nested = firstIncidentCoordinate(coord);
    if (nested) return nested;
  }

  return null;
}

function mapTomTomIncidentType(iconCategory: number): TrafficData['incidents'][number]['type'] {
  if ([1, 6, 7, 8, 14].includes(iconCategory)) return 'ACCIDENT';
  if ([9, 10, 11, 12, 13].includes(iconCategory)) return 'ROAD_CLOSURE';
  if ([16, 17].includes(iconCategory)) return 'CONSTRUCTION';
  return 'CONGESTION';
}

/**
 * Build traffic data from TomTom route traffic delay
 */
function buildFromTrafficDelay(
  trafficDelayMinutes: number,
  distanceKm: number,
  durationMinutes: number,
  timeFactors: ReturnType<typeof getTimeFactors>,
  waypoints: Coordinates[]
): TrafficData {
  const expectedSpeed = distanceKm > 50 ? 75 : distanceKm > 20 ? 55 : 45;
  const freeFlowDuration = (distanceKm / expectedSpeed) * 60;
  const actualDuration = durationMinutes;

  // Determine congestion from delay magnitude
  let congestionLevel: TrafficData['congestionLevel'];
  if (trafficDelayMinutes <= 5) congestionLevel = 'LOW';
  else if (trafficDelayMinutes <= 15) congestionLevel = 'MODERATE';
  else if (trafficDelayMinutes <= 30) congestionLevel = 'HIGH';
  else congestionLevel = 'SEVERE';

  // Calculate actual speed based on total duration
  const actualSpeedKmh = (distanceKm / actualDuration) * 60;

  const incidents = generateIncidents(congestionLevel, timeFactors, waypoints);

  console.log(
    `[TrafficTool] ✓ Congestion: ${congestionLevel} (traffic delay: ${trafficDelayMinutes} min)`
  );

  return {
    congestionLevel,
    congestionScore: scoreFromSpeedRatio(actualSpeedKmh / expectedSpeed),
    averageSpeed: Math.round(actualSpeedKmh),
    expectedSpeed,
    delayMinutes: trafficDelayMinutes,
    incidents,
    source: 'ROUTE_TRAFFIC',
  };
}

// ─── Speed-Based Analysis ─────────────────────────────────────────────────────

/**
 * Derive congestion level from actual driving speed.
 * Expected speed benchmarks for Indian roads:
 *   Highways: ~80 km/h free flow
 *   City roads: ~45–55 km/h free flow
 *   Mixed: ~60 km/h as general baseline
 */
function buildFromSpeed(
  actualSpeedKmh: number,
  distanceKm: number,
  durationMinutes: number,
  timeFactors: ReturnType<typeof getTimeFactors>,
  waypoints: Coordinates[]
): TrafficData {
  // Estimate free-flow speed based on distance (longer = more highway)
  const expectedSpeed = distanceKm > 50 ? 75 : distanceKm > 20 ? 55 : 45;
  const ratio = actualSpeedKmh / expectedSpeed;

  let congestionLevel: TrafficData['congestionLevel'];
  if (ratio >= 0.85) congestionLevel = 'LOW';
  else if (ratio >= 0.65) congestionLevel = 'MODERATE';
  else if (ratio >= 0.45) congestionLevel = 'HIGH';
  else congestionLevel = 'SEVERE';

  // Expected duration without traffic
  const freeFlowDuration = (distanceKm / expectedSpeed) * 60;
  const delayMinutes = Math.max(0, Math.round(durationMinutes - freeFlowDuration));

  const incidents = generateIncidents(congestionLevel, timeFactors, waypoints);

  console.log(
    `[TrafficTool] ✓ Congestion: ${congestionLevel} (${actualSpeedKmh.toFixed(0)} km/h actual vs ${expectedSpeed} km/h expected, +${delayMinutes} min delay)`
  );

  return {
    congestionLevel,
    congestionScore: scoreFromSpeedRatio(ratio),
    averageSpeed: Math.round(actualSpeedKmh),
    expectedSpeed,
    delayMinutes,
    incidents,
    source: 'DERIVED',
  };
}

// ─── Time-of-Day Heuristic ────────────────────────────────────────────────────

/**
 * When route speed is unavailable, estimate traffic from time of day.
 * Based on typical Indian urban traffic patterns.
 */
function buildTimeOfDayEstimate(
  timeFactors: ReturnType<typeof getTimeFactors>,
  waypoints: Coordinates[]
): TrafficData {
  const congestionMap: Record<string, TrafficData['congestionLevel']> = {
    MORNING_RUSH: 'HIGH',
    EVENING_RUSH: 'HIGH',
    DAY: 'MODERATE',
    NIGHT: 'LOW',
    LATE_NIGHT: 'LOW',
  };

  const weekendBonus = timeFactors.isWeekend ? 1 : 0; // Index shift toward lighter traffic

  const levels: TrafficData['congestionLevel'][] = ['LOW', 'MODERATE', 'HIGH', 'SEVERE'];
  const baseLevel = congestionMap[timeFactors.timeOfDay];
  const baseIdx = levels.indexOf(baseLevel);
  const adjustedIdx = Math.max(0, baseIdx - weekendBonus);
  const congestionLevel = levels[adjustedIdx];

  const expectedSpeed = 50;
  const speedMultiplier: Record<TrafficData['congestionLevel'], number> = {
    LOW: 0.9,
    MODERATE: 0.7,
    HIGH: 0.5,
    SEVERE: 0.3,
  };
  const actualSpeed = Math.round(expectedSpeed * speedMultiplier[congestionLevel]);
  const delayMultiplier: Record<TrafficData['congestionLevel'], number> = {
    LOW: 0,
    MODERATE: 8,
    HIGH: 20,
    SEVERE: 40,
  };

  const incidents = generateIncidents(congestionLevel, timeFactors, waypoints);

  console.log(`[TrafficTool] ✓ Congestion estimate (time-based): ${congestionLevel}`);

  return {
    congestionLevel,
    congestionScore: scoreFromSpeedRatio(actualSpeed / expectedSpeed),
    averageSpeed: actualSpeed,
    expectedSpeed,
    delayMinutes: delayMultiplier[congestionLevel],
    incidents,
    source: 'HEURISTIC',
  };
}

// ─── Incident Generation ──────────────────────────────────────────────────────

/**
 * Generate realistic traffic incidents based on congestion level and time.
 * NOT random — based on deterministic rules from traffic patterns.
 */
function generateIncidents(
  level: TrafficData['congestionLevel'],
  timeFactors: ReturnType<typeof getTimeFactors>,
  waypoints: Coordinates[]
): TrafficData['incidents'] {
  const incidents: TrafficData['incidents'] = [];
  const midpoint = waypoints[Math.floor(waypoints.length / 2)] || waypoints[0] || {
    lat: 20.5937,
    lng: 78.9629,
  };

  if (level === 'SEVERE') {
    incidents.push({
      type: 'CONGESTION',
      location: midpoint,
      description: 'Severe traffic congestion — significant delays expected',
      severity: 'HIGH',
      source: 'HEURISTIC',
    });
  }

  if (level === 'HIGH' || level === 'SEVERE') {
    if (timeFactors.timeOfDay === 'MORNING_RUSH' || timeFactors.timeOfDay === 'EVENING_RUSH') {
      incidents.push({
        type: 'CONGESTION',
        location: waypoints[1] || midpoint,
        description: `${timeFactors.timeOfDay === 'MORNING_RUSH' ? 'Morning' : 'Evening'} rush hour bottleneck`,
        severity: 'MEDIUM',
        source: 'HEURISTIC',
      });
    }
  }

  return incidents;
}

// ─── Time Factors ─────────────────────────────────────────────────────────────

function getTimeFactors() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  let timeOfDay: string;
  if (hour >= 7 && hour < 10) timeOfDay = 'MORNING_RUSH';
  else if (hour >= 10 && hour < 17) timeOfDay = 'DAY';
  else if (hour >= 17 && hour < 21) timeOfDay = 'EVENING_RUSH';
  else if (hour >= 21 || hour < 5) timeOfDay = 'LATE_NIGHT';
  else timeOfDay = 'NIGHT';

  return {
    timeOfDay,
    isWeekend: day === 0 || day === 6,
    hour,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDurationMinutes(duration: string): number {
  // Parse formats: "45 mins", "1h 30m", "2 hours", "1 hr 20 min"
  let total = 0;
  const hourMatch = duration.match(/(\d+)\s*h/i);
  const minMatch = duration.match(/(\d+)\s*m(?:in)?/i);
  if (hourMatch) total += parseInt(hourMatch[1]) * 60;
  if (minMatch) total += parseInt(minMatch[1]);
  return total || 30; // Default 30 mins if parse fails
}

function sampleRoutePoints(waypoints: Coordinates[], maxSamples: number): Coordinates[] {
  if (waypoints.length <= maxSamples) return waypoints;

  const samples: Coordinates[] = [];
  const lastIndex = waypoints.length - 1;
  for (let i = 0; i < maxSamples; i++) {
    const index = Math.round((i / (maxSamples - 1)) * lastIndex);
    samples.push(waypoints[index]);
  }
  return samples;
}

function weightedAverage(items: Array<{ value: number; weight: number }>): number {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return average(items.map((item) => item.value));
  return items.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoreFromSpeedRatio(ratio: number): number {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  return Math.round((1 - clampedRatio) * 100);
}

function congestionLevelFromScore(score: number): TrafficData['congestionLevel'] {
  if (score <= 15) return 'LOW';
  if (score <= 35) return 'MODERATE';
  if (score <= 60) return 'HIGH';
  return 'SEVERE';
}

function routeBoundingBox(waypoints: Coordinates[], paddingDegrees: number) {
  const latitudes = waypoints.map((point) => point.lat);
  const longitudes = waypoints.map((point) => point.lng);

  return {
    minLat: Math.min(...latitudes) - paddingDegrees,
    maxLat: Math.max(...latitudes) + paddingDegrees,
    minLng: Math.min(...longitudes) - paddingDegrees,
    maxLng: Math.max(...longitudes) + paddingDegrees,
  };
}
