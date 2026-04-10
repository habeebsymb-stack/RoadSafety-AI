// Road Safety AI — Weather Agent
// Wraps the weather tool with agent-level logging, timing, and error handling

import { getWeatherData } from '@/lib/tools/weather.tool';
import type { WeatherData, Coordinates, AgentResponse } from '@/lib/types';

export class WeatherAgent {
  async run(location: Coordinates): Promise<AgentResponse<WeatherData>> {
    const start = Date.now();
    console.log(`[Agent:Weather] Fetching weather at [${location.lat.toFixed(3)}, ${location.lng.toFixed(3)}]...`);

    try {
      const data = await getWeatherData(location);
      const elapsed = Date.now() - start;

      console.log(
        `[Agent:Weather] ✓ Done in ${elapsed}ms — ${data.condition}, ${data.temperature}°C, visibility ${data.visibility}km`
      );

      // Confidence based on whether we got real API data
      // If condition is CLOUDY and visibility is exactly 9 (fallback defaults), lower confidence
      const looksLikeFallback =
        data.condition === 'CLOUDY' && data.visibility === 9 && data.humidity === 60;
      const confidence = looksLikeFallback ? 60 : 88;

      return {
        success: true,
        data,
        confidence,
        processingTime: elapsed,
      };
    } catch (err) {
      const elapsed = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : 'Weather agent failed';
      console.error(`[Agent:Weather] ✗ Failed in ${elapsed}ms:`, errorMsg);

      return {
        success: false,
        error: errorMsg,
        confidence: 0,
        processingTime: elapsed,
      };
    }
  }
}
