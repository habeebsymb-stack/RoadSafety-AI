// Road Safety AI — Road Condition Agent
// Wraps the road tool with agent-level logging, timing, and error handling

import { getRoadCondition } from '@/lib/tools/road.tool';
import type { RoadCondition, RouteData, AgentResponse } from '@/lib/types';

export class RoadAgent {
  async run(route: RouteData): Promise<AgentResponse<RoadCondition>> {
    const start = Date.now();
    console.log('[Agent:Road] Analyzing road conditions...');

    try {
      const data = await getRoadCondition(route);
      const elapsed = Date.now() - start;

      console.log(
        `[Agent:Road] ✓ Done in ${elapsed}ms — quality: ${data.quality}, hazards: ${data.hazards.length}, infra: ${data.infrastructureScore}`
      );

      // Confidence: higher if we got real OSM data (more hazards = more detail = higher confidence)
      const confidence = data.hazards.length > 0 ? 80 : 70;

      return {
        success: true,
        data,
        confidence,
        processingTime: elapsed,
      };
    } catch (err) {
      const elapsed = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : 'Road agent failed';
      console.error(`[Agent:Road] ✗ Failed in ${elapsed}ms:`, errorMsg);

      return {
        success: false,
        error: errorMsg,
        confidence: 0,
        processingTime: elapsed,
      };
    }
  }
}
