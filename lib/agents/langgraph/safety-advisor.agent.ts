import { generateSafetyExplanation } from '@/lib/services/gemini';
import type { SafetyPrecaution } from '@/lib/types';
import type { RoadSafetyGraphState } from './state';

function buildFallbackQueries(state: RoadSafetyGraphState): string[] {
  const riskLevel = state.riskAnalysis?.risk_level.toLowerCase() ?? 'current';
  const queries = [
    `Why is this route marked ${riskLevel} risk?`,
    'Which location on this route needs the most caution?',
  ];

  const firstHazard = state.roadCondition?.hazards[0];
  if (firstHazard) {
    queries.push(`How should I handle ${firstHazard.type.toLowerCase().replace(/_/g, ' ')} here?`);
  }

  if (state.traffic?.congestionLevel === 'HIGH' || state.traffic?.congestionLevel === 'SEVERE') {
    queries.push('How should I drive through the congested sections?');
  }

  if (state.weather && state.weather.condition !== 'CLEAR') {
    queries.push(`How does ${state.weather.condition.toLowerCase().replace(/_/g, ' ')} change my driving plan?`);
  }

  queries.push('What should I check before starting this trip?');
  return queries.slice(0, 5);
}

function mergePrecautions(base: SafetyPrecaution[], tips: string[]): SafetyPrecaution[] {
  const existingActions = new Set(base.map((precaution) => precaution.action.toLowerCase().slice(0, 30)));
  const aiPrecautions = tips
    .filter((tip) => !existingActions.has(tip.toLowerCase().slice(0, 30)))
    .map((tip, index) => ({
      priority: index === 0 ? ('HIGH' as const) : index < 2 ? ('MEDIUM' as const) : ('LOW' as const),
      action: tip,
      reason: 'AI-recommended based on available route conditions',
    }));

  return [...base, ...aiPrecautions].slice(0, 8);
}

export async function safetyAdvisorAgent(state: RoadSafetyGraphState): Promise<Partial<RoadSafetyGraphState>> {
  if (!state.route || !state.traffic || !state.roadCondition || !state.weather || !state.timeFactors || !state.riskAnalysis) {
    throw new Error('Safety Advisor Agent cannot run without completed risk analysis');
  }

  console.log('\n[LangGraph:SafetyAdvisor] Generating explanation, precautions, and user queries');

  const aiResult = await generateSafetyExplanation(
    state.request.origin,
    state.request.destination,
    state.riskAnalysis,
    state.traffic,
    state.weather,
    state.roadCondition,
    state.timeFactors
  );

  const suggestedQueries =
    aiResult.suggestedQueries.length > 0 ? aiResult.suggestedQueries.slice(0, 5) : buildFallbackQueries(state);

  const enhancedRiskAnalysis = {
    ...state.riskAnalysis,
    explanation: aiResult.explanation,
    precautions: mergePrecautions(state.riskAnalysis.precautions, aiResult.drivingTips),
  };

  return {
    riskAnalysis: enhancedRiskAnalysis,
    safetyAdvisor: {
      explanation: aiResult.explanation,
      topConcerns: aiResult.topConcerns,
      drivingTips: aiResult.drivingTips,
      suggestedQueries,
      confidenceReasoning: aiResult.confidence_reasoning,
      aiEnhanced: aiResult.aiEnhanced,
    },
    suggestedQueries,
  };
}
