import { END, START, StateGraph } from '@langchain/langgraph';
import type { Coordinates, FullAnalysis } from '@/lib/types';
import { riskDetectionAgent } from './risk-detection.agent';
import { routeContextAgent } from './route-context.agent';
import { safetyAdvisorAgent } from './safety-advisor.agent';
import { RoadSafetyGraphAnnotation, toFullAnalysis } from './state';

const roadSafetyGraph = new StateGraph(RoadSafetyGraphAnnotation)
  .addNode('routeContextAgent', routeContextAgent)
  .addNode('riskDetectionAgent', riskDetectionAgent)
  .addNode('safetyAdvisorAgent', safetyAdvisorAgent)
  .addEdge(START, 'routeContextAgent')
  .addEdge('routeContextAgent', 'riskDetectionAgent')
  .addEdge('riskDetectionAgent', 'safetyAdvisorAgent')
  .addEdge('safetyAdvisorAgent', END)
  .compile();

export async function runLangGraphAnalysis(
  origin: string,
  destination: string,
  originCoords?: Coordinates,
  destCoords?: Coordinates,
  preferSafest = true
): Promise<FullAnalysis> {
  console.log('\n========================================');
  console.log(`[LangGraph:Master] Starting 3-agent analysis: "${origin}" -> "${destination}"`);
  console.log(`[LangGraph:Master] prefer safest: ${preferSafest}`);
  console.log('========================================');

  const startedAt = Date.now();
  const finalState = await roadSafetyGraph.invoke({
    request: {
      origin,
      destination,
      preferSafest,
      originCoords,
      destCoords,
    },
  });
  const analysis = toFullAnalysis(finalState);

  console.log(
    `[LangGraph:Master] Complete in ${Date.now() - startedAt}ms - score ${analysis.riskAnalysis.risk_score}/${100} (${analysis.riskAnalysis.risk_level})`
  );
  console.log('========================================\n');

  return analysis;
}
