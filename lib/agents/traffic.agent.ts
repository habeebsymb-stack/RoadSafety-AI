// Road Safety AI — Traffic Agent
// Wraps the traffic tool with agent-level logging, timing, and error handling

import { getTrafficData } from '@/lib/tools/traffic.tool';
import type { TrafficData, RouteData, AgentResponse } from '@/lib/types';

export class TrafficAgent {
  async run(route: RouteData): Promise<AgentResponse<TrafficData>> {
    const start = Date.now();
    console.log('[Agent:Traffic] Starting traffic analysis...');

    try {
      const data = await getTrafficData(route);
      const elapsed = Date.now() - start;

      console.log(
        `[Agent:Traffic] ✓ Done in ${elapsed}ms — ${data.congestionLevel} congestion, ${data.delayMinutes} min delay`
      );

      // Confidence based on how complete the data is
      const confidence =
        data.source === 'TOMTOM_REALTIME'
          ? 90
          : data.incidents.length > 0
          ? 85
          : data.averageSpeed > 0
          ? 75
          : 60;

      return {
        success: true,
        data,
        confidence,
        processingTime: elapsed,
      };
    } catch (err) {
      const elapsed = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : 'Traffic agent failed';
      console.error(`[Agent:Traffic] ✗ Failed in ${elapsed}ms:`, errorMsg);

      return {
        success: false,
        error: errorMsg,
        confidence: 0,
        processingTime: elapsed,
      };
    }
  }
}
