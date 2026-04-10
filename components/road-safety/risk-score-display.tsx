'use client';

import { useEffect, useState } from 'react';
import type { RiskAnalysisResult, RiskFactor } from '@/lib/types';

interface RiskScoreDisplayProps {
  analysis?: RiskAnalysisResult;
  isLoading?: boolean;
}

export function RiskScoreDisplay({ analysis, isLoading }: RiskScoreDisplayProps) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    if (analysis?.risk_score !== undefined) {
      const target = analysis.risk_score;
      const duration = 1000;
      const steps = 60;
      const increment = target / steps;
      let current = 0;

      const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
          setAnimatedScore(target);
          clearInterval(timer);
        } else {
          setAnimatedScore(Math.round(current));
        }
      }, duration / steps);

      return () => clearInterval(timer);
    }
  }, [analysis?.risk_score]);

  const getRiskColor = (level?: string) => {
    switch (level) {
      case 'LOW':
        return 'text-risk-low';
      case 'MEDIUM':
        return 'text-risk-medium';
      case 'HIGH':
        return 'text-risk-high';
      default:
        return 'text-muted-foreground';
    }
  };

  const getRiskBg = (level?: string) => {
    switch (level) {
      case 'LOW':
        return 'bg-risk-low';
      case 'MEDIUM':
        return 'bg-risk-medium';
      case 'HIGH':
        return 'bg-risk-high';
      default:
        return 'bg-muted';
    }
  };

  const getStrokeDasharray = (score: number) => {
    const circumference = 2 * Math.PI * 70;
    const offset = circumference - (score / 100) * circumference;
    return `${circumference - offset} ${offset}`;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="relative h-40 w-40 sm:h-48 sm:w-48">
          <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
            <circle
              cx="80"
              cy="80"
              r="70"
              fill="none"
              className="stroke-muted"
              strokeWidth="12"
            />
            <circle
              cx="80"
              cy="80"
              r="70"
              fill="none"
              className="stroke-primary/30"
              strokeWidth="12"
              strokeDasharray="100 340"
            >
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 80 80"
                to="360 80 80"
                dur="1s"
                repeatCount="indefinite"
              />
            </circle>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm text-muted-foreground">Analyzing...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="relative h-40 w-40 sm:h-48 sm:w-48">
          <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
            <circle
              cx="80"
              cy="80"
              r="70"
              fill="none"
              className="stroke-muted"
              strokeWidth="12"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold text-muted-foreground">--</span>
            <span className="text-sm text-muted-foreground mt-1">No data</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center p-4 sm:p-6">
      {/* Main Score Circle */}
      <div className="relative h-40 w-40 sm:h-48 sm:w-48">
        <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
          {/* Background circle */}
          <circle
            cx="80"
            cy="80"
            r="70"
            fill="none"
            className="stroke-muted"
            strokeWidth="12"
          />
          {/* Progress circle */}
          <circle
            cx="80"
            cy="80"
            r="70"
            fill="none"
            className={getRiskBg(analysis.risk_level).replace('bg-', 'stroke-')}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={getStrokeDasharray(animatedScore)}
            style={{
              transition: 'stroke-dasharray 0.5s ease-out',
            }}
          />
        </svg>
        
        {/* Score text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-bold sm:text-5xl ${getRiskColor(analysis.risk_level)}`}>
            {animatedScore}
          </span>
          <span className="text-sm text-muted-foreground mt-1">Risk Score</span>
        </div>
      </div>

      {/* Risk Level Badge */}
      <div className={`mt-4 px-4 py-2 rounded-full ${getRiskBg(analysis.risk_level)} bg-opacity-20`}>
        <span className={`text-sm font-semibold ${getRiskColor(analysis.risk_level)}`}>
          {analysis.risk_level} RISK
        </span>
      </div>

      {/* Confidence */}
      <div className="mt-4 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Confidence:</span>
        <span className="font-medium text-foreground">{analysis.confidence}%</span>
      </div>

      {/* Breakdown — real per-category risk scores from analysis */}
      <div className="w-full mt-6 space-y-3">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Risk Breakdown
        </div>
        
        <BreakdownBar 
          label="Traffic" 
          value={getCategoryScore(analysis.factors, 'TRAFFIC')}
          color="bg-chart-1" 
        />
        <BreakdownBar 
          label="Road Condition" 
          value={getCategoryScore(analysis.factors, 'ROAD')}
          color="bg-chart-2" 
        />
        <BreakdownBar 
          label="Weather" 
          value={getCategoryScore(analysis.factors, 'WEATHER')}
          color="bg-chart-3" 
        />
        <BreakdownBar 
          label="Time Factors" 
          value={getCategoryScore(analysis.factors, 'TIME')}
          color="bg-chart-4" 
        />
      </div>
    </div>
  );
}

/**
 * Compute the highest impact score for a given risk category.
 * Falls back to the weight percentage if no factors exist for that category.
 */
function getCategoryScore(
  factors: RiskFactor[] | undefined,
  category: RiskFactor['category']
): number {
  if (!factors || factors.length === 0) {
    // Default weight percentages when no real data
    const defaults: Record<RiskFactor['category'], number> = {
      TRAFFIC: 35, ROAD: 25, WEATHER: 20, TIME: 20,
    };
    return defaults[category];
  }
  const matching = factors.filter(f => f.category === category);
  if (matching.length === 0) return 10; // Low baseline if category not a concern
  const maxImpact = Math.max(...matching.map(f => f.impact));
  return Math.min(100, Math.round(maxImpact));
}

function BreakdownBar({
  label,
  value,
  color
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div className="w-16 sm:w-20 text-xs text-muted-foreground truncate">{label}</div>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${value}%` }}
        />
      </div>
      <div className="w-8 text-xs text-muted-foreground text-right">{value}%</div>
    </div>
  );
}
