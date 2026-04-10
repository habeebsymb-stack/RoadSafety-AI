// Road Safety AI — Master Orchestrator Agent
// Controls the full analysis pipeline:
//   User Request → Route Tool → [Traffic + Road + Weather Agents] → Risk Agent → Response
//
// Guarantees:
//  - No random data in production flow
//  - Clean data passing between agents
//  - Logging at every step
//  - Graceful degradation if individual agents fail
//  - Response format matches FullAnalysis type exactly

import type {
  RouteData,
  TrafficData,
  RoadCondition,
  WeatherData,
  TimeFactors,
  RiskAnalysisResult,
  FullAnalysis,
  Coordinates,
} from '@/lib/types';

import { getRouteData } from '@/lib/tools/route.tool';
import { TrafficAgent } from './traffic.agent';
import { RoadAgent } from './road.agent';
import { WeatherAgent } from './weather.agent';
import { RiskAnalysisAgent } from './risk.agent';

// ─── Fallback data factories (used only when an agent fully fails) ─────────────

function fallbackTraffic(): TrafficData {
  const hour = new Date().getHours();
  const isRush = (hour >= 7 && hour < 10) || (hour >= 17 && hour < 21);
  return {
    congestionLevel: isRush ? 'HIGH' : 'MODERATE',
    averageSpeed: isRush ? 25 : 40,
    expectedSpeed: 50,
    delayMinutes: isRush ? 20 : 8,
    incidents: [],
  };
}

function fallbackRoadCondition(): RoadCondition {
  return {
    quality: 'FAIR',
    hazards: [],
    infrastructureScore: 55,
    lightingCondition: new Date().getHours() >= 6 && new Date().getHours() < 19 ? 'GOOD' : 'MODERATE',
  };
}

function fallbackWeather(): WeatherData {
  return {
    condition: 'CLOUDY',
    temperature: 28,
    humidity: 65,
    visibility: 8,
    windSpeed: 10,
    precipitation: 0,
    description: 'Weather data unavailable — using estimated conditions',
  };
}

function getTimeFactors(): TimeFactors {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  let timeOfDay: TimeFactors['timeOfDay'];
  if (hour >= 7 && hour < 10) timeOfDay = 'MORNING_RUSH';
  else if (hour >= 10 && hour < 17) timeOfDay = 'DAY';
  else if (hour >= 17 && hour < 21) timeOfDay = 'EVENING_RUSH';
  else if (hour >= 21 || hour < 5) timeOfDay = 'LATE_NIGHT';
  else timeOfDay = 'NIGHT';

  return {
    timeOfDay,
    isWeekend: day === 0 || day === 6,
    isHoliday: false,
    daylight: hour >= 6 && hour < 19,
  };
}

// ─── Master Orchestrator ──────────────────────────────────────────────────────

/**
 * Run the full multi-agent safety analysis pipeline.
 *
 * Flow:
 *   1. Route Tool — fetch real route (Ola Maps / Google Maps)
 *   2. Traffic Agent  ─┐
 *      Road Agent      ├─ Parallel execution
 *      Weather Agent  ─┘
 *   3. Time Tool — synchronous (no API needed)
 *   4. Risk Agent — deterministic scoring
 *   5. Return FullAnalysis
 */
export async function runAnalysis(
  origin: string,
  destination: string,
  originCoords?: Coordinates,
  destCoords?: Coordinates
): Promise<FullAnalysis> {
  console.log('\n========================================');
  console.log(`[Master] Starting analysis: "${origin}" → "${destination}"`);
  if (originCoords || destCoords) {
    console.log(`[Master] Pre-resolved coordinates: origin=${JSON.stringify(originCoords)} dest=${JSON.stringify(destCoords)}`);
  }
  console.log(`[Master] Time: ${new Date().toISOString()}`);
  console.log('========================================');

  const pipelineStart = Date.now();

  // ── Step 1: Route Tool ────────────────────────────────────────────────────
  console.log('\n[Master] Step 1: Fetching route data...');
  let route: RouteData;
  try {
    route = await getRouteData(origin, destination, originCoords, destCoords);
    console.log(`[Master] ✓ Route: ${route.distance}, ${route.duration}`);
  } catch (err) {
    console.error('[Master] ✗ Route fetch failed:', err instanceof Error ? err.message : err);
    throw new Error(`Could not resolve route from "${origin}" to "${destination}". Please check the location names.`);
  }

  // ── Step 2: Parallel Agent Calls ──────────────────────────────────────────
  console.log('\n[Master] Step 2: Running Traffic, Road, and Weather agents in parallel...');
  const trafficAgent = new TrafficAgent();
  const roadAgent = new RoadAgent();
  const weatherAgent = new WeatherAgent();

  const [trafficResult, roadResult, weatherResult] = await Promise.allSettled([
    trafficAgent.run(route),
    roadAgent.run(route),
    weatherAgent.run(route.destination.coordinates),
  ]);

  // Extract data with fallbacks if any agent fails
  const trafficResponse = trafficResult.status === 'fulfilled' ? trafficResult.value : null;
  const roadResponse = roadResult.status === 'fulfilled' ? roadResult.value : null;
  const weatherResponse = weatherResult.status === 'fulfilled' ? weatherResult.value : null;

  const traffic: TrafficData = trafficResponse?.data ?? fallbackTraffic();
  const roadCondition: RoadCondition = roadResponse?.data ?? fallbackRoadCondition();
  const weather: WeatherData = weatherResponse?.data ?? fallbackWeather();

  const agentConfidences = {
    traffic: trafficResponse?.confidence ?? 55,
    road: roadResponse?.confidence ?? 55,
    weather: weatherResponse?.confidence ?? 55,
  };

  // Log agent outcomes
  if (!trafficResponse?.success) console.warn('[Master] ⚠ Traffic agent used fallback data');
  if (!roadResponse?.success) console.warn('[Master] ⚠ Road agent used fallback data');
  if (!weatherResponse?.success) console.warn('[Master] ⚠ Weather agent used fallback data');

  // ── Step 3: Time Factors (synchronous) ───────────────────────────────────
  console.log('\n[Master] Step 3: Computing time factors...');
  const timeFactors = getTimeFactors();
  console.log(`[Master] ✓ Time: ${timeFactors.timeOfDay}, daylight: ${timeFactors.daylight}, weekend: ${timeFactors.isWeekend}`);

  // ── Step 4: Risk Analysis Agent ───────────────────────────────────────────
  console.log('\n[Master] Step 4: Running Risk Analysis Agent...');
  const riskAgent = new RiskAnalysisAgent();
  const riskResult = riskAgent.run(traffic, roadCondition, weather, timeFactors, agentConfidences);

  if (!riskResult.success || !riskResult.data) {
    throw new Error('Risk analysis failed to produce a result. Please try again.');
  }

  const riskAnalysis: RiskAnalysisResult = riskResult.data;

  const totalTime = Date.now() - pipelineStart;
  console.log(`\n[Master] ✓ Pipeline complete in ${totalTime}ms`);
  console.log(`[Master] Risk: ${riskAnalysis.risk_score}/100 (${riskAnalysis.risk_level}), Confidence: ${riskAnalysis.confidence}%`);
  console.log('========================================\n');

  return {
    route,
    traffic,
    roadCondition,
    weather,
    timeFactors,
    riskAnalysis,
  };
}

// ─── Legacy exports (kept for compatibility) ───────────────────────────────────

/**
 * @deprecated Use runAnalysis() from this module directly.
 * Kept for backwards compatibility with any imports.
 */
export { calculateRiskScore, calculateRiskScore as analyzeRisk } from './risk.agent';
