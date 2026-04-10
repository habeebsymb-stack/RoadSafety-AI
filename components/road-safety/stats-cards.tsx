'use client';

import { TrendingUp, TrendingDown, Shield, AlertTriangle, Car, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface StatsCardsProps {
  totalAnalyses?: number;
  averageScore?: number;
  highRiskRoutes?: number;
  hazardsReported?: number;
}

export function StatsCards({
  totalAnalyses = 1247,
  averageScore = 58,
  highRiskRoutes = 23,
  hazardsReported = 156,
}: StatsCardsProps) {
  const stats = [
    {
      title: 'Routes Analyzed',
      value: totalAnalyses.toLocaleString(),
      change: '+12%',
      trend: 'up',
      icon: MapPin,
      color: 'text-chart-1',
      bgColor: 'bg-chart-1/10',
    },
    {
      title: 'Average Safety Score',
      value: averageScore,
      suffix: '/100',
      change: '+3 pts',
      trend: 'up',
      icon: Shield,
      color: 'text-chart-5',
      bgColor: 'bg-chart-5/10',
    },
    {
      title: 'High Risk Routes',
      value: highRiskRoutes,
      change: '-8%',
      trend: 'down',
      icon: AlertTriangle,
      color: 'text-risk-high',
      bgColor: 'bg-risk-high/10',
    },
    {
      title: 'Hazards Reported',
      value: hazardsReported,
      change: '+24',
      trend: 'up',
      icon: Car,
      color: 'text-chart-3',
      bgColor: 'bg-chart-3/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
      {stats.map((stat, index) => {
        const Icon = stat.icon;
        const TrendIcon = stat.trend === 'up' ? TrendingUp : TrendingDown;
        const trendColor = stat.trend === 'up' 
          ? stat.title.includes('Risk') ? 'text-risk-high' : 'text-risk-low'
          : stat.title.includes('Risk') ? 'text-risk-low' : 'text-risk-high';

        return (
          <Card key={index} className="border-border">
            <CardContent className="pt-4 sm:pt-6">
              <div className="flex items-start justify-between gap-2">
                <div className={`p-1.5 sm:p-2 rounded-lg ${stat.bgColor} flex-shrink-0`}>
                  <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.color}`} />
                </div>
                <div className={`flex items-center gap-1 text-xs ${trendColor} flex-shrink-0`}>
                  <TrendIcon className="w-3 h-3" />
                  {stat.change}
                </div>
              </div>
              <div className="mt-3 sm:mt-4">
                <div className="text-xl sm:text-2xl font-bold text-foreground">
                  {stat.value}{stat.suffix || ''}
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground">{stat.title}</div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
