'use client';

import { useState } from 'react';
import { Share2, Copy, Check, MessageCircle, Twitter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { FullAnalysis } from '@/lib/types';

interface ShareRouteProps {
  analysis: FullAnalysis | null;
}

export function ShareRoute({ analysis }: ShareRouteProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  if (!analysis) return null;

  const { route, riskAnalysis } = analysis;
  const routeLabel = `${route.origin.address} -> ${route.destination.address}`;
  const shareText = `Road Safety Analysis: ${routeLabel}
Safety Score: ${riskAnalysis.risk_score}/100 (${riskAnalysis.risk_level} Risk)
Distance: ${route.distance}
Duration: ${route.duration}

Analyzed by Road Safety AI`;

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}?from=${encodeURIComponent(route.origin.address)}&to=${encodeURIComponent(route.destination.address)}`
      : '';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const nativeShare = async () => {
    if (typeof navigator.share !== 'function') return;
    try {
      await navigator.share({
        title: 'Road Safety Analysis',
        text: shareText,
        url: shareUrl,
      });
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Share2 className="w-4 h-4" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Route Analysis</DialogTitle>
          <DialogDescription>Share your route safety analysis with others</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-secondary/50 p-4">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span className="min-w-0 break-words font-medium text-foreground">{routeLabel}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-sm font-semibold ${
                  riskAnalysis.risk_level === 'LOW'
                    ? 'bg-risk-low/20 text-risk-low'
                    : riskAnalysis.risk_level === 'MEDIUM'
                      ? 'bg-risk-medium/20 text-risk-medium'
                      : 'bg-risk-high/20 text-risk-high'
                }`}
              >
                {riskAnalysis.risk_score}/100
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              {route.distance} • {route.duration}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Input readOnly value={shareUrl} className="flex-1 bg-secondary/30" />
            <Button variant="secondary" size="icon" onClick={handleCopy} className="flex-shrink-0">
              {copied ? <Check className="w-4 h-4 text-risk-low" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
              <Button variant="outline" className="flex-1 min-w-[100px] gap-2" onClick={nativeShare}>
                <Share2 className="w-4 h-4" />
                Share
              </Button>
            )}
            <Button
              variant="outline"
              className="flex-1 min-w-[100px] gap-2"
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText}\n\n${shareUrl}`)}`, '_blank')}
            >
              <MessageCircle className="w-4 h-4" />
              WhatsApp
            </Button>
            <Button
              variant="outline"
              className="flex-1 min-w-[100px] gap-2"
              onClick={() =>
                window.open(
                  `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
                  '_blank',
                  'width=550,height=420'
                )
              }
            >
              <Twitter className="w-4 h-4" />
              Twitter
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
