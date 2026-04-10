import { RiskAnalysisAgent } from '@/lib/agents/risk.agent';
import type { RoadSafetyGraphState } from './state';

export async function riskDetectionAgent(state: RoadSafetyGraphState): Promise<Partial<RoadSafetyGraphState>> {
  if (!state.traffic || !state.roadCondition || !state.weather || !state.timeFactors || !state.agentConfidences) {
    throw new Error('Risk Detection Agent cannot run without route context data');
  }

  console.log('\n[LangGraph:RiskDetection] Running deterministic risk engine');

  const riskAgent = new RiskAnalysisAgent();
  const riskResult = riskAgent.run(
    state.traffic,
    state.roadCondition,
    state.weather,
    state.timeFactors,
    state.agentConfidences
  );

  if (!riskResult.success || !riskResult.data) {
    throw new Error(riskResult.error || 'Risk Detection Agent failed to produce a score');
  }

  return {
    riskAnalysis: riskResult.data,
  };
}
