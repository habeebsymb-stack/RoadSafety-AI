// Road Safety AI — Weather Tool
// Fetches real-time weather using OpenWeatherMap API
// Maps OWM condition codes to our internal WeatherData enum

import axios from 'axios';
import type { WeatherData, Coordinates } from '@/lib/types';
import { cache, locationCacheKey } from '@/lib/services/cache';

const OWM_BASE = 'https://api.openweathermap.org/data/2.5';

/**
 * Main tool: fetch real weather for a given coordinate.
 * Caches result for 5 minutes per ~1km grid cell.
 */
export async function getWeatherData(location: Coordinates): Promise<WeatherData> {
  const cacheKey = locationCacheKey('weather', location.lat, location.lng);
  const cached = cache.get<WeatherData>(cacheKey);
  if (cached) {
    console.log(`[WeatherTool] Cache hit: weather at [${location.lat.toFixed(2)}, ${location.lng.toFixed(2)}]`);
    return cached;
  }

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    console.warn('[WeatherTool] OPENWEATHER_API_KEY not set — using time-based estimate');
    return buildTimeBasedFallback(location);
  }

  try {
    console.log(`[WeatherTool] Fetching weather at [${location.lat.toFixed(3)}, ${location.lng.toFixed(3)}]...`);

    const response = await axios.get(`${OWM_BASE}/weather`, {
      params: {
        lat: location.lat,
        lon: location.lng,
        appid: apiKey,
        units: 'metric',
        lang: 'en',
      },
      timeout: 8000,
    });

    const data = response.data;
    const weather = parseOWMResponse(data);

    cache.set(cacheKey, weather, 5 * 60 * 1000); // 5-minute cache
    console.log(`[WeatherTool] ✓ Weather: ${weather.condition} (${weather.temperature}°C, visibility: ${weather.visibility}km)`);
    return weather;
  } catch (err) {
    console.warn('[WeatherTool] API call failed:', err instanceof Error ? err.message : err);
    return buildTimeBasedFallback(location);
  }
}

// ─── OWM Response Parser ──────────────────────────────────────────────────────

function parseOWMResponse(data: {
  weather: Array<{ id: number; description: string }>;
  main: { temp: number; humidity: number };
  visibility?: number;
  wind: { speed: number };
  rain?: { '1h'?: number; '3h'?: number };
  snow?: { '1h'?: number };
}): WeatherData {
  const owmId = data.weather[0]?.id ?? 800;
  const condition = mapOWMCodeToCondition(owmId);

  // OWM visibility is in meters, we want km
  const visibilityKm = data.visibility ? data.visibility / 1000 : getVisibilityByCondition(condition);

  // OWM wind speed is in m/s, convert to km/h
  const windKmh = Math.round((data.wind?.speed ?? 0) * 3.6);

  // Precipitation in mm (last 1h)
  const precipitation = data.rain?.['1h'] ?? data.rain?.['3h'] ?? data.snow?.['1h'] ?? 0;

  return {
    condition,
    temperature: Math.round(data.main.temp),
    humidity: Math.round(data.main.humidity),
    visibility: parseFloat(Math.min(visibilityKm, 15).toFixed(1)),
    windSpeed: windKmh,
    precipitation: parseFloat(precipitation.toFixed(1)),
    description: buildDescription(condition, data.weather[0]?.description ?? ''),
  };
}

/**
 * Map OWM weather code to our internal condition enum.
 * Reference: https://openweathermap.org/weather-conditions
 */
function mapOWMCodeToCondition(code: number): WeatherData['condition'] {
  if (code === 800) return 'CLEAR';
  if (code >= 801 && code <= 804) return 'CLOUDY';
  if (code >= 300 && code <= 321) return 'RAIN'; // Drizzle
  if (code >= 500 && code <= 504) return 'RAIN'; // Light/moderate rain
  if (code >= 511 && code <= 531) return 'HEAVY_RAIN'; // Heavy rain
  if (code >= 600 && code <= 622) return 'RAIN'; // Snow (mapped to rain for India)
  if (code >= 700 && code <= 741) return 'FOG'; // Mist, smoke, haze, fog
  if (code >= 742 && code <= 771) return 'CLOUDY'; // Sand, dust
  if (code >= 781 && code <= 799) return 'STORM'; // Tornado, squalls
  if (code >= 200 && code <= 232) return 'STORM'; // Thunderstorm
  return 'CLEAR';
}

function getVisibilityByCondition(condition: WeatherData['condition']): number {
  const map: Record<WeatherData['condition'], number> = {
    CLEAR: 12,
    CLOUDY: 9,
    RAIN: 5,
    HEAVY_RAIN: 2,
    FOG: 0.3,
    STORM: 1,
  };
  return map[condition];
}

function buildDescription(condition: WeatherData['condition'], rawDesc: string): string {
  const baseDesc = rawDesc
    ? rawDesc.charAt(0).toUpperCase() + rawDesc.slice(1)
    : '';

  const safetyNote: Record<WeatherData['condition'], string> = {
    CLEAR: 'Clear skies with good visibility',
    CLOUDY: 'Overcast conditions with moderate visibility',
    RAIN: 'Rainfall reducing road grip and visibility',
    HEAVY_RAIN: 'Heavy rainfall significantly reducing visibility',
    FOG: 'Dense fog with very low visibility — extreme caution required',
    STORM: 'Severe storm conditions — avoid travel if possible',
  };

  return baseDesc || safetyNote[condition];
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

/**
 * If no API key or call fails, build a weather estimate based on:
 * - Season (month)
 * - Time of day
 * - Geographic latitude (Northern India vs Southern)
 * This is NOT random — it's based on climate patterns.
 */
function buildTimeBasedFallback(location: Coordinates): WeatherData {
  const now = new Date();
  const month = now.getMonth() + 1; // 1–12
  const hour = now.getHours();

  // Rough Indian climate zones
  const isNorth = location.lat > 23;
  const isCoastal = location.lng < 74 || location.lng > 80;

  // Monsoon season: June–September
  const isMonsoon = month >= 6 && month <= 9;
  // Winter: November–February (North India)
  const isWinter = isNorth && (month <= 2 || month >= 11);
  // Summer: March–May
  const isSummer = month >= 3 && month <= 5;

  let condition: WeatherData['condition'];
  let temperature: number;

  if (isMonsoon) {
    condition = isCoastal ? 'HEAVY_RAIN' : 'RAIN';
    temperature = isNorth ? 32 : 27;
  } else if (isWinter) {
    condition = hour < 8 || hour > 20 ? 'FOG' : 'CLOUDY';
    temperature = isNorth ? 14 : 22;
  } else if (isSummer) {
    condition = 'CLEAR';
    temperature = isNorth ? 42 : 34;
  } else {
    condition = 'CLOUDY';
    temperature = 28;
  }

  const visibility = getVisibilityByCondition(condition);

  console.log(`[WeatherTool] Using climate-based estimate: ${condition} (${temperature}°C)`);
  return {
    condition,
    temperature,
    humidity: isMonsoon ? 85 : isWinter ? 60 : 45,
    visibility: parseFloat(visibility.toFixed(1)),
    windSpeed: isMonsoon ? 22 : isWinter ? 8 : 12,
    precipitation: isMonsoon ? (isCoastal ? 40 : 20) : 0,
    description: buildDescription(condition, ''),
  };
}
