'use client';

import { AlertTriangle, Car, Cloud, Clock, MapPin } from 'lucide-react';
import type { RiskFactor, SafetyPrecaution } from '@/lib/types';

interface RiskFactorsPanelProps {
  factors?: RiskFactor[];
  precautions?: SafetyPrecaution[];
  explanation?: string;
  isLoading?: boolean;
}

export function RiskFactorsPanel({ 
  factors, 
  precautions, 
  explanation,
  isLoading 
}: RiskFactorsPanelProps) {
  const getCategoryIcon = (category: RiskFactor['category']) => {
    switch (category) {
      case 'TRAFFIC':
        return <Car className="w-4 h-4" />;
      case 'ROAD':
        return <MapPin className="w-4 h-4" />;
      case 'WEATHER':
        return <Cloud className="w-4 h-4" />;
      case 'TIME':
        return <Clock className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (category: RiskFactor['category']) => {
    switch (category) {
      case 'TRAFFIC':
        return 'bg-chart-1/20 text-chart-1 border-chart-1/30';
      case 'ROAD':
        return 'bg-chart-2/20 text-chart-2 border-chart-2/30';
      case 'WEATHER':
        return 'bg-chart-3/20 text-chart-3 border-chart-3/30';
      case 'TIME':
        return 'bg-chart-4/20 text-chart-4 border-chart-4/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getPriorityColor = (priority: SafetyPrecaution['priority']) => {
    switch (priority) {
      case 'HIGH':
        return 'bg-risk-high/20 border-risk-high/30 text-risk-high';
      case 'MEDIUM':
        return 'bg-risk-medium/20 border-risk-medium/30 text-risk-medium';
      case 'LOW':
        return 'bg-risk-low/20 border-risk-low/30 text-risk-low';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="space-y-3">
          <div className="h-4 w-24 bg-muted rounded" />
          <div className="h-20 bg-muted rounded-lg" />
        </div>
        <div className="space-y-3">
          <div className="h-4 w-24 bg-muted rounded" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!factors || factors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="w-12 h-12 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">
          Enter a route to see risk factors and safety precautions
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI Explanation */}
      {explanation && (
        <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/20 rounded-lg">
              <svg 
                className="w-4 h-4 text-primary" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2"
              >
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>
                <circle cx="8" cy="14" r="2"/>
                <circle cx="16" cy="14" r="2"/>
              </svg>
            </div>
            <div>
              <div className="text-xs font-medium text-primary mb-1">AI Analysis</div>
              <p className="text-sm text-foreground leading-relaxed">{explanation}</p>
            </div>
          </div>
        </div>
      )}

      {/* Risk Factors */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Risk Factors
        </h3>
        <div className="space-y-2">
          {factors.map((factor, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg border ${getCategoryColor(factor.category)}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5">
                    {getCategoryIcon(factor.category)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium capitalize">
                      {factor.factor}
                    </div>
                    <div className="mt-0.5 break-words text-xs opacity-80">
                      {factor.description}
                    </div>
                  </div>
                </div>
                <div className="text-xs font-medium sm:whitespace-nowrap">
                  Impact: {factor.impact}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Safety Precautions */}
      {precautions && precautions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <svg 
              className="w-4 h-4" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            Safety Precautions
          </h3>
          <div className="space-y-2">
            {precautions.map((precaution, index) => (
              <div 
                key={index}
                className={`p-3 rounded-lg border ${getPriorityColor(precaution.priority)}`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                  <div className="mt-0.5 text-xs font-bold uppercase opacity-80">
                    {precaution.priority}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {precaution.action}
                    </div>
                    <div className="mt-0.5 break-words text-xs opacity-80">
                      {precaution.reason}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
