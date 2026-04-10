'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Volume2, VolumeX } from 'lucide-react';
import type { FullAnalysis } from '@/lib/types';

interface VoiceAlertsProps {
  analysis: FullAnalysis | null;
  isNewAnalysis: boolean;
}

export function VoiceAlerts({ analysis, isNewAnalysis }: VoiceAlertsProps) {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [hasSpoken, setHasSpoken] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  
  // Handle mounting to avoid hydration issues
  useEffect(() => {
    setIsMounted(true);
    setSpeechSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
  }, []);

  const speak = useCallback((text: string) => {
    if (!voiceEnabled || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 0.8;
    
    // Try to use a female voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
      v.lang.startsWith('en') && v.name.includes('Female')
    ) || voices.find(v => v.lang.startsWith('en'));
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    window.speechSynthesis.speak(utterance);
  }, [voiceEnabled]);

  // Speak analysis results when new analysis arrives
  useEffect(() => {
    if (!analysis || !isNewAnalysis || hasSpoken) return;

    const { route, riskAnalysis, weather, traffic } = analysis;
    
    let announcement = `Route analysis complete. `;
    announcement += `From ${route.origin.address} to ${route.destination.address}. `;
    announcement += `Safety score is ${riskAnalysis.risk_score} out of 100. `;
    announcement += `Risk level is ${riskAnalysis.risk_level}. `;

    // Add warnings for high risk
    if (riskAnalysis.risk_level === 'HIGH') {
      announcement += `Warning: This route has high risk factors. `;
      announcement += `Consider delaying travel or choosing an alternative route. `;
    }

    // Weather warnings
    if (['HEAVY_RAIN', 'FOG', 'STORM'].includes(weather.condition)) {
      announcement += `Weather alert: ${weather.description}. `;
      announcement += `Visibility is ${weather.visibility} kilometers. `;
    }

    // Traffic warnings
    if (['SEVERE', 'HIGH'].includes(traffic.congestionLevel)) {
      announcement += `Traffic warning: ${traffic.congestionLevel.toLowerCase()} congestion. `;
      announcement += `Expected delay of ${traffic.delayMinutes} minutes. `;
    }

    // Top precaution
    if (riskAnalysis.precautions.length > 0) {
      announcement += `Top safety tip: ${riskAnalysis.precautions[0].action}. `;
    }

    speak(announcement);
    setHasSpoken(true);
  }, [analysis, isNewAnalysis, hasSpoken, speak]);

  // Reset hasSpoken when analysis changes
  useEffect(() => {
    if (isNewAnalysis) {
      setHasSpoken(false);
    }
  }, [isNewAnalysis]);

  // Load voice preference
  useEffect(() => {
    const saved = localStorage.getItem('road-safety-voice');
    if (saved === 'true') {
      setVoiceEnabled(true);
    }
  }, []);

  // Save voice preference
  useEffect(() => {
    localStorage.setItem('road-safety-voice', voiceEnabled.toString());
  }, [voiceEnabled]);

  // Load voices (needed for some browsers)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  const toggleVoice = () => {
    const newState = !voiceEnabled;
    setVoiceEnabled(newState);
    
    if (newState && typeof window !== 'undefined' && window.speechSynthesis) {
      // Test voice with a short message
      const testUtterance = new SpeechSynthesisUtterance('Voice alerts enabled');
      testUtterance.rate = 0.9;
      testUtterance.volume = 0.5;
      window.speechSynthesis.speak(testUtterance);
    } else if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  // Don't render anything until mounted (prevents hydration mismatch)
  if (!isMounted) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-9 w-9 p-0 text-muted-foreground"
        aria-label="Enable voice alerts"
        title="Voice alerts"
        disabled
      >
        <VolumeX className="h-4 w-4" />
      </Button>
    );
  }

  // Hide if speech synthesis is not supported
  if (!speechSupported) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleVoice}
      className={`h-9 w-9 p-0 ${voiceEnabled ? 'text-primary' : 'text-muted-foreground'}`}
      aria-label={voiceEnabled ? 'Disable voice alerts' : 'Enable voice alerts'}
      title={voiceEnabled ? 'Voice alerts on' : 'Voice alerts off'}
    >
      {voiceEnabled ? (
        <Volume2 className="h-4 w-4" />
      ) : (
        <VolumeX className="h-4 w-4" />
      )}
    </Button>
  );
}
