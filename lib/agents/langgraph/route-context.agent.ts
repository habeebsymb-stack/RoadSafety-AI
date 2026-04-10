import type { Coordinates, RoadCondition, TimeFactors, TrafficData, WeatherData } from '@/lib/types';
import { getRouteData } from '@/lib/tools/route.tool';
import { RoadAgent } from '@/lib/agents/road.agent';
import { TrafficAgent } from '@/lib/agents/traffic.agent';
import { WeatherAgent } from '@/lib/agents/weather.agent';
import type { RoadSafetyGraphState } from './state';

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
    description: 'Weather data unavailable; using estimated conditions',
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

function formatCoords(coords?: Coordinates): string {
  return coords ? `${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}` : 'text';
}

export async function routeContextAgent(state: RoadSafetyGraphState): Promise<Partial<RoadSafetyGraphState>> {
  const { origin, destination, originCoords, destCoords } = state.request;
  const warnings: string[] = [];

  console.log('\n[LangGraph:RouteContext] Collecting route, traffic, road, weather, and time context');
  console.log(`[LangGraph:RouteContext] ${origin} -> ${destination}`);
  console.log(`[LangGraph:RouteContext] coords origin=${formatCoords(originCoords)} dest=${formatCoords(destCoords)}`);

  const route = await getRouteData(origin, destination, originCoords, destCoords);
  const trafficAgent = new TrafficAgent();
  const roadAgent = new RoadAgent();
  const weatherAgent = new WeatherAgent();

  const [trafficResult, roadResult, weatherResult] = await Promise.allSettled([
    trafficAgent.run(route),
    roadAgent.run(route),
    weatherAgent.run(route.destination.coordinates),
  ]);

  const trafficResponse = trafficResult.status === 'fulfilled' ? trafficResult.value : null;
  const roadResponse = roadResult.status === 'fulfilled' ? roadResult.value : null;
  const weatherResponse = weatherResult.status === 'fulfilled' ? weatherResult.value : null;

  if (!trafficResponse?.success) warnings.push('Traffic data was estimated because live traffic analysis was unavailable.');
  if (!roadResponse?.success) warnings.push('Road condition data was estimated because road analysis was unavailable.');
  if (!weatherResponse?.success) warnings.push('Weather data was estimated because live weather analysis was unavailable.');

  const traffic = trafficResponse?.data ?? fallbackTraffic();
  const roadCondition = roadResponse?.data ?? fallbackRoadCondition();
  const weather = weatherResponse?.data ?? fallbackWeather();
  const timeFactors = getTimeFactors();

  return {
    route,
    traffic,
    roadCondition,
    weather,
    timeFactors,
    agentConfidences: {
      traffic: trafficResponse?.confidence ?? 55,
      road: roadResponse?.confidence ?? 55,
      weather: weatherResponse?.confidence ?? 55,
    },
    warnings,
  };
}
