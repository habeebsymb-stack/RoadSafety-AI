'use client';

import { useState } from 'react';
import { AlertTriangle, MapPin, Camera, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const HAZARD_TYPES = [
  { value: 'POTHOLE', label: 'Pothole', icon: '🕳️' },
  { value: 'NARROW_ROAD', label: 'Narrow Road', icon: '↔️' },
  { value: 'SHARP_TURN', label: 'Sharp Turn', icon: '↪️' },
  { value: 'FLOODING', label: 'Flooding', icon: '🌊' },
  { value: 'CONSTRUCTION', label: 'Construction', icon: '🚧' },
  { value: 'ANIMAL_CROSSING', label: 'Animal Crossing', icon: '🐄' },
  { value: 'PEDESTRIAN_ZONE', label: 'Pedestrian Zone', icon: '🚶' },
  { value: 'ACCIDENT', label: 'Accident', icon: '🚗' },
];

const SEVERITY_LEVELS = [
  { value: 'LOW', label: 'Low - Minor inconvenience', color: 'text-risk-low' },
  { value: 'MEDIUM', label: 'Medium - Requires caution', color: 'text-risk-medium' },
  { value: 'HIGH', label: 'High - Dangerous', color: 'text-risk-high' },
];

interface ReportHazardDialogProps {
  trigger?: React.ReactNode;
}

export function ReportHazardDialog({ trigger }: ReportHazardDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  
  const [formData, setFormData] = useState({
    hazardType: '',
    severity: '',
    location: '',
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setIsSubmitting(false);
    setSubmitted(true);
    
    // Reset after showing success
    setTimeout(() => {
      setOpen(false);
      setSubmitted(false);
      setFormData({
        hazardType: '',
        severity: '',
        location: '',
        description: '',
      });
    }, 2000);
  };

  const isFormValid = formData.hazardType && formData.severity && formData.location;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" className="gap-2">
            <AlertTriangle className="w-4 h-4" />
            Report Hazard
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-risk-medium" />
            Report Road Hazard
          </DialogTitle>
          <DialogDescription>
            Help other drivers by reporting road hazards in your area. Your report contributes to safer roads.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="py-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-risk-low/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-risk-low" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Report Submitted!</h3>
            <p className="text-sm text-muted-foreground">
              Thank you for helping make roads safer. Your report will be reviewed and added to our database.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            {/* Hazard Type */}
            <div className="space-y-2">
              <Label htmlFor="hazardType">Hazard Type *</Label>
              <Select 
                value={formData.hazardType} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, hazardType: value }))}
              >
                <SelectTrigger id="hazardType">
                  <SelectValue placeholder="Select hazard type" />
                </SelectTrigger>
                <SelectContent>
                  {HAZARD_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      <span className="flex items-center gap-2">
                        <span>{type.icon}</span>
                        <span>{type.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Severity */}
            <div className="space-y-2">
              <Label htmlFor="severity">Severity Level *</Label>
              <Select 
                value={formData.severity} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, severity: value }))}
              >
                <SelectTrigger id="severity">
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      <span className={level.color}>{level.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="location">Location *</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="location"
                  placeholder="e.g., MG Road near Metro Station, Bangalore"
                  value={formData.location}
                  onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Additional Details (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Describe the hazard, its exact location, or any other helpful details..."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Info Box */}
            <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
              <div className="flex items-start gap-2 text-sm">
                <svg className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <p className="text-muted-foreground">
                  Reports are anonymous and help improve safety scores for all users. High-severity reports are prioritized for verification.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isFormValid || isSubmitting}>
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Submit Report
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
