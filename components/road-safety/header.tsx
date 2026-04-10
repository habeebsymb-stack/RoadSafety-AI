'use client';

import { Shield, Menu, X, Github, Info } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './theme-toggle';

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full" />
            <div className="relative flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 border border-primary/20">
              <Shield className="w-5 h-5 text-primary" />
            </div>
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">
              Road Safety AI
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Intelligent Route Analysis
            </p>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <a 
            href="#features" 
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Features
          </a>
          <a 
            href="#how-it-works" 
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            How It Works
          </a>
          <a 
            href="#about" 
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            About
          </a>
        </nav>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          <Button variant="ghost" size="sm" className="gap-2">
            <Github className="w-4 h-4" />
            <span>GitHub</span>
          </Button>
          <Button size="sm" className="gap-2">
            <Info className="w-4 h-4" />
            <span>Learn More</span>
          </Button>
        </div>

        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? (
            <X className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </Button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-background">
          <nav className="container px-4 py-4 space-y-4">
            <a 
              href="#features" 
              className="block text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Features
            </a>
            <a 
              href="#how-it-works" 
              className="block text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              How It Works
            </a>
            <a 
              href="#about" 
              className="block text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              About
            </a>
            <div className="flex flex-col gap-2 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Theme</span>
                <ThemeToggle />
              </div>
              <Button variant="ghost" size="sm" className="justify-start gap-2">
                <Github className="w-4 h-4" />
                <span>GitHub</span>
              </Button>
              <Button size="sm" className="justify-start gap-2">
                <Info className="w-4 h-4" />
                <span>Learn More</span>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
