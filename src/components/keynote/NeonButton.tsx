import React from 'react';
import { cn } from '@/lib/utils';

interface NeonButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline';
}

export function NeonButton({ 
  children, 
  className,
  variant = 'primary',
  ...props 
}: NeonButtonProps) {
  const variantClass = variant === 'primary'
    ? 'keynote-button'
    : variant === 'secondary'
    ? 'keynote-button bg-transparent border border-[var(--glass-border)] text-[var(--accent)]'
    : 'keynote-button bg-transparent border border-[var(--glass-border)]';

  return (
    <button
      className={cn(variantClass, className)}
      {...props}
    >
      {children}
    </button>
  );
}

