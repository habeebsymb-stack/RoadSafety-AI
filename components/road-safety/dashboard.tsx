'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RouteInput } from './route-input';
import { InteractiveMap } from './interactive-map';
import { RiskScoreDisplay } from './risk-score-display';
import { RiskFactorsPanel } from './risk-factors-panel';
import { WeatherDisplay } from './weather-display';
import { TrafficDisplay } from './traffic-display';
import { ReportHazardDialog } from './report-hazard-dialog';
import { StatsCards } from './stats-cards';
import { RouteHistory, addRouteToHistory } from './route-history';
import { ShareRoute } from './share-route';
import { VoiceAlerts } from './voice-alerts';
import type { FullAnalysis, Coordinates } from '@/lib/types';

interface DashboardProps {
  olaMapsApiKey: string;
}

function buildSafetyQueryAnswer(query: string, analysis: FullAnalysis): string {
  const normalized = query.toLowerCase();

  if (normalized.includes('why')) {
    return analysis.riskAnalysis.explanation;
  }

  if (normalized.includes('hazard') || normalized.includes('handle')) {
    const hazards = analysis.roadCondition.hazards;
    if (hazards.length === 0) {
      return 'No specific road hazards were detected from the available data. Keep normal caution because road conditions can change quickly.';
    }
    return `Detected route hazards include ${hazards.map((hazard) => hazard.type.toLowerCase().replace(/_/g, ' ')).join(', ')}. Slow down near marked points and keep extra spacing from two-wheelers and pedestrians.`;
  }

  if (normalized.includes('congest')) {
    return `Traffic is currently ${analysis.traffic.congestionLevel.toLowerCase()} with an estimated delay of ${analysis.traffic.delayMinutes} minutes. Keep lane changes minimal and maintain more following distance.`;
  }

  if (normalized.includes('weather')) {
    return `Weather is ${analysis.weather.description.toLowerCase()} with ${analysis.weather.visibility}km visibility. Adjust speed and braking distance if visibility or road grip changes.`;
  }

  return analysis.riskAnalysis.precautions[0]?.action || 'Start with lower speed, keep extra distance, and watch for local hazards along the route.';
}

export function Dashboard({ olaMapsApiKey }: DashboardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isNewAnalysis, setIsNewAnalysis] = useState(false);
  const [selectedSafetyQuery, setSelectedSafetyQuery] = useState<string | null>(null);
  const analysisRef = useRef<HTMLDivElement>(null);

  const handleAnalyze = async (
    origin: string,
    destination: string,
    preferSafest: boolean,
    originCoords?: Coordinates,
    destCoords?: Coordinates
  ) => {
    setIsLoading(true);
    setError(null);
    setIsNewAnalysis(false);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          origin,
          destination,
          preferSafest,
          originCoords,
          destCoords,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Analysis failed');
      }

      setAnalysis(data.data);
      setIsNewAnalysis(true);
      setSelectedSafetyQuery(null);

      // Add to history
      addRouteToHistory(
        origin,
        destination,
        data.data.riskAnalysis.risk_level,
        data.data.riskAnalysis.risk_score
      );

      // Scroll to results on mobile
      setTimeout(() => {
        analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle route selection from history
  const handleSelectRoute = (origin: string, destination: string) => {
    handleAnalyze(origin, destination, false);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
        <div className="relative container px-4 py-10 sm:py-12 md:py-16">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary sm:text-sm mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              AI-Powered Safety Analysis
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-balance text-foreground sm:text-4xl lg:text-5xl mb-4">
              Drive Safer with Intelligent
              <span className="text-primary"> Route Analysis</span>
            </h1>
            <p className="mx-auto max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
              Get real-time safety scores, traffic analysis, weather conditions, and AI-powered
              driving precautions for any route in India.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <ReportHazardDialog />
              <ShareRoute analysis={analysis} />
              <VoiceAlerts analysis={analysis} isNewAnalysis={isNewAnalysis} />
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container px-4 py-5 sm:py-6 border-b border-border">
        <StatsCards />
      </section>

      {/* Main Dashboard */}
      <section className="container px-4 py-6 sm:py-8">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] lg:gap-6">
          {/* Left Panel - Route Input & Score */}
          <div className="min-w-0 space-y-5 lg:space-y-6">
            {/* Route Input Card */}
            <Card className="border-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Plan Your Route</CardTitle>
                <CardDescription>
                  Enter your origin and destination to analyze safety
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RouteInput onAnalyze={handleAnalyze} isLoading={isLoading} />
              </CardContent>
            </Card>
            
            {/* Route History */}
            <RouteHistory onSelectRoute={handleSelectRoute} />

            {/* Risk Score Card */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Safety Score</CardTitle>
                <CardDescription>
                  Overall route risk assessment
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RiskScoreDisplay 
                  analysis={analysis?.riskAnalysis} 
                  isLoading={isLoading} 
                />
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Map & Details */}
          <div className="min-w-0 space-y-5 lg:space-y-6">
            {/* Map Card */}
            <Card className="border-border overflow-hidden" ref={analysisRef}>
              <CardContent className="p-0">
                <div className="h-[340px] sm:h-[420px] md:h-[500px]">
                  <InteractiveMap 
                    apiKey={olaMapsApiKey}
                    route={analysis?.route}
                    roadCondition={analysis?.roadCondition}
                    traffic={analysis?.traffic}
                    riskLevel={analysis?.riskAnalysis.risk_level}
                    isLoading={isLoading}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Details Tabs */}
            <Tabs defaultValue="factors" className="w-full">
              <TabsList className="grid h-auto w-full grid-cols-1 gap-1 bg-secondary/50 p-1 min-[420px]:grid-cols-3">
                <TabsTrigger value="factors" className="w-full">Risk Factors</TabsTrigger>
                <TabsTrigger value="conditions" className="w-full">Conditions</TabsTrigger>
                <TabsTrigger value="alerts" className="w-full">Alerts</TabsTrigger>
              </TabsList>
              
              <TabsContent value="factors" className="mt-4">
                <Card className="border-border">
                  <CardContent className="pt-6">
                    <RiskFactorsPanel
                      factors={analysis?.riskAnalysis.factors}
                      precautions={analysis?.riskAnalysis.precautions}
                      explanation={analysis?.riskAnalysis.explanation}
                      isLoading={isLoading}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="conditions" className="mt-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <WeatherDisplay 
                    weather={analysis?.weather} 
                    isLoading={isLoading} 
                  />
                  <TrafficDisplay 
                    traffic={analysis?.traffic} 
                    isLoading={isLoading}
                    estimatedDuration={analysis?.route.duration}
                  />
                </div>
                
                {/* Road Condition Summary */}
                {analysis?.roadCondition && (
                  <Card className="mt-4 border-border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Road Condition</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                        <div>
                          <div className="text-lg font-semibold text-foreground capitalize">
                            {analysis.roadCondition.quality.toLowerCase().replace('_', ' ')}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Infrastructure Score: {analysis.roadCondition.infrastructureScore}/100
                          </div>
                        </div>
                        <div className="min-[420px]:text-right">
                          <div className="text-sm text-muted-foreground">Lighting</div>
                          <div className="text-sm font-medium text-foreground capitalize">
                            {analysis.roadCondition.lightingCondition.toLowerCase()}
                          </div>
                        </div>
                      </div>
                      
                      {analysis.roadCondition.hazards.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-border">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                            Detected Hazards
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {analysis.roadCondition.hazards.map((hazard, index) => (
                              <span 
                                key={index}
                                className="px-2 py-1 text-xs rounded-full bg-risk-medium/20 text-risk-medium capitalize"
                              >
                                {hazard.type.toLowerCase().replace('_', ' ')}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="alerts" className="mt-4">
                <Card className="border-border">
                  <CardContent className="pt-6">
                    {analysis ? (
                      <div className="space-y-3">
                        {/* High Priority Alerts */}
                        {analysis.riskAnalysis.risk_level === 'HIGH' && (
                          <div className="p-4 bg-risk-high/10 border border-risk-high/20 rounded-lg">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-full bg-risk-high/20 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-risk-high" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                  <line x1="12" y1="9" x2="12" y2="13"/>
                                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                                </svg>
                              </div>
                              <div>
                                <div className="font-medium text-risk-high">High Risk Alert</div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  This route has elevated risk factors. Consider delaying travel or choosing an alternative route if possible.
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Weather Alert */}
                        {(analysis.weather.condition === 'HEAVY_RAIN' || 
                          analysis.weather.condition === 'FOG' || 
                          analysis.weather.condition === 'STORM') && (
                          <div className="p-4 bg-chart-3/10 border border-chart-3/20 rounded-lg">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-full bg-chart-3/20 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-chart-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/>
                                  <polyline points="13 11 9 17 15 17 11 23"/>
                                </svg>
                              </div>
                              <div>
                                <div className="font-medium text-chart-3">Weather Warning</div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {analysis.weather.description}. Visibility is {analysis.weather.visibility}km.
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Traffic Alert */}
                        {(analysis.traffic.congestionLevel === 'SEVERE' || 
                          analysis.traffic.congestionLevel === 'HIGH') && (
                          <div className="p-4 bg-chart-1/10 border border-chart-1/20 rounded-lg">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-full bg-chart-1/20 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-chart-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="1" y="3" width="15" height="13"/>
                                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
                                  <circle cx="5.5" cy="18.5" r="2.5"/>
                                  <circle cx="18.5" cy="18.5" r="2.5"/>
                                </svg>
                              </div>
                              <div>
                                <div className="font-medium text-chart-1">Traffic Congestion</div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {analysis.traffic.congestionLevel.toLowerCase()} traffic detected. Expected delay: +{analysis.traffic.delayMinutes} minutes.
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Road Hazards */}
                        {analysis.roadCondition.hazards.length > 0 && (
                          <div className="p-4 bg-chart-2/10 border border-chart-2/20 rounded-lg">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-full bg-chart-2/20 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-chart-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10"/>
                                  <line x1="12" y1="8" x2="12" y2="12"/>
                                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                                </svg>
                              </div>
                              <div>
                                <div className="font-medium text-chart-2">Road Hazards Detected</div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {analysis.roadCondition.hazards.length} hazard(s) on route: {analysis.roadCondition.hazards.map(h => h.type.toLowerCase().replace('_', ' ')).join(', ')}.
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* All Clear */}
                        {analysis.riskAnalysis.risk_level === 'LOW' && 
                         analysis.weather.condition !== 'HEAVY_RAIN' && 
                         analysis.weather.condition !== 'FOG' &&
                         analysis.traffic.congestionLevel !== 'SEVERE' &&
                         analysis.traffic.congestionLevel !== 'HIGH' &&
                         analysis.roadCondition.hazards.length === 0 && (
                          <div className="p-4 bg-risk-low/10 border border-risk-low/20 rounded-lg">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-full bg-risk-low/20 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-risk-low" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                              </div>
                              <div>
                                <div className="font-medium text-risk-low">All Clear</div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  No significant alerts for this route. Conditions are favorable for travel.
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>Enter a route to see alerts</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {analysis?.suggestedQueries && analysis.suggestedQueries.length > 0 && (
              <Card className="border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Safety Advisor</CardTitle>
                  <CardDescription>
                    Ask route-specific road safety questions generated by the final agent.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {analysis.suggestedQueries.map((query) => (
                      <button
                        key={query}
                        type="button"
                        onClick={() => setSelectedSafetyQuery(query)}
                        className="rounded-full border border-border bg-secondary/50 px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 sm:text-sm"
                      >
                        {query}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-lg border border-border bg-card/70 p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {selectedSafetyQuery || 'Advisor summary'}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-foreground">
                      {selectedSafetyQuery
                        ? buildSafetyQueryAnswer(selectedSafetyQuery, analysis)
                        : analysis.safetyAdvisor?.confidenceReasoning || analysis.riskAnalysis.explanation}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2 text-destructive">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              <span className="font-medium">Error</span>
            </div>
            <p className="text-sm text-destructive/80 mt-1">{error}</p>
          </div>
        )}
      </section>

      {/* Features Section */}
      <section id="features" className="border-t border-border bg-secondary/20">
        <div className="container px-4 py-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
              AI-Powered Safety Features
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Our multi-agent AI system analyzes multiple data sources to provide comprehensive safety insights.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: (
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="1" y="3" width="15" height="13"/>
                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
                    <circle cx="5.5" cy="18.5" r="2.5"/>
                    <circle cx="18.5" cy="18.5" r="2.5"/>
                  </svg>
                ),
                title: 'Traffic Analysis',
                description: 'Real-time traffic density, congestion patterns, and incident detection.',
              },
              {
                icon: (
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                ),
                title: 'Road Conditions',
                description: 'Infrastructure quality assessment including potholes, narrow roads, and hazards.',
              },
              {
                icon: (
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/>
                    <polyline points="13 11 9 17 15 17 11 23"/>
                  </svg>
                ),
                title: 'Weather Impact',
                description: 'Rain, fog, visibility, and adverse weather condition analysis.',
              },
              {
                icon: (
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                ),
                title: 'Safety Score',
                description: 'Comprehensive 0-100 risk score with actionable driving precautions.',
              },
            ].map((feature, index) => (
              <Card key={index} className="border-border bg-card/50 hover:bg-card transition-colors">
                <CardContent className="pt-6">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
                    {feature.icon}
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="border-t border-border">
        <div className="container px-4 py-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
              How It Works
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Our multi-agent AI system processes your route through specialized analysis agents.
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="relative">
              {/* Connection Line */}
              <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-border hidden md:block" />
              
              <div className="space-y-8">
                {[
                  {
                    step: '01',
                    title: 'Route Processing',
                    description: 'Enter your origin and destination. The Master Agent initiates the analysis pipeline.',
                  },
                  {
                    step: '02',
                    title: 'Data Collection',
                    description: 'Traffic, Road, and Weather Agents simultaneously gather real-time data from multiple sources.',
                  },
                  {
                    step: '03',
                    title: 'Risk Analysis',
                    description: 'The Risk Analysis Agent processes all data using our weighted scoring algorithm.',
                  },
                  {
                    step: '04',
                    title: 'Results & Precautions',
                    description: 'Receive your safety score, risk factors, and AI-generated driving precautions.',
                  },
                ].map((item, index) => (
                  <div key={index} className="flex gap-6">
                    <div className="relative z-10 flex-shrink-0 w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
                      {item.step}
                    </div>
                    <div className="pt-2">
                      <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="about" className="border-t border-border bg-secondary/20">
        <div className="container px-4 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <div>
                <div className="font-semibold text-foreground">Road Safety AI</div>
                <div className="text-xs text-muted-foreground">Safer journeys through AI</div>
              </div>
            </div>
            
            <div className="text-sm text-muted-foreground text-center md:text-right">
              <p>Built for safer roads in India</p>
              <p className="mt-1">Powered by multi-agent AI technology</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
