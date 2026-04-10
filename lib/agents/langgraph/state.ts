import { Annotation } from '@langchain/langgraph';
import type {
  Coordinates,
  FullAnalysis,
  RoadCondition,
  RouteData,
  RiskAnalysisResult,
  SafetyAdvisorResult,
  TimeFactors,
  TrafficData,
  WeatherData,
} from '@/lib/types';

export interface RoadSafetyGraphRequest {
  origin: string;
  destination: string;
  preferSafest: boolean;
  originCoords?: Coordinates;
  destCoords?: Coordinates;
}

export interface AgentConfidences {
  traffic: number;
  road: number;
  weather: number;
}

export const RoadSafetyGraphAnnotation = Annotation.Root({
  request: Annotation<RoadSafetyGraphRequest>(),
  route: Annotation<RouteData | undefined>(),
  traffic: Annotation<TrafficData | undefined>(),
  roadCondition: Annotation<RoadCondition | undefined>(),
  weather: Annotation<WeatherData | undefined>(),
  timeFactors: Annotation<TimeFactors | undefined>(),
  riskAnalysis: Annotation<RiskAnalysisResult | undefined>(),
  safetyAdvisor: Annotation<SafetyAdvisorResult | undefined>(),
  suggestedQueries: Annotation<string[] | undefined>(),
  agentConfidences: Annotation<AgentConfidences | undefined>(),
  warnings: Annotation<string[]>({
    reducer: (left, right) => [...(left ?? []), ...(right ?? [])],
    default: () => [],
  }),
});

export type RoadSafetyGraphState = typeof RoadSafetyGraphAnnotation.State;

export function toFullAnalysis(state: RoadSafetyGraphState): FullAnalysis {
  if (!state.route || !state.traffic || !state.roadCondition || !state.weather || !state.timeFactors || !state.riskAnalysis) {
    throw new Error('LangGraph analysis finished without all required safety data');
  }

  return {
    route: state.route,
    traffic: state.traffic,
    roadCondition: state.roadCondition,
    weather: state.weather,
    timeFactors: state.timeFactors,
    riskAnalysis: state.riskAnalysis,
    safetyAdvisor: state.safetyAdvisor,
    suggestedQueries: state.suggestedQueries,
    warnings: state.warnings,
  };
}
