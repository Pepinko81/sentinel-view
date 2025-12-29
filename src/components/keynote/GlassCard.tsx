import React from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'stat' | 'modal';
  delay?: number;
}

export function GlassCard({ 
  children, 
  className, 
  variant = 'default',
  delay = 0,
  ...props 
}: GlassCardProps) {
  const baseClass = variant === 'stat' 
    ? 'keynote-stat' 
    : variant === 'modal'
    ? 'keynote-modal'
    : 'keynote-glass';

  return (
    <div
      className={cn(
        baseClass,
        'fade-in-keynote',
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
      {...props}
    >
      {children}
    </div>
  );
}

