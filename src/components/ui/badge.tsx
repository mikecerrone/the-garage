'use client';

import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { WorkoutType } from '@/types/database';
import { workoutTypeConfig } from '@/lib/utils';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'workout';
  workoutType?: WorkoutType;
}

function Badge({ className, variant = 'default', workoutType, ...props }: BadgeProps) {
  if (variant === 'workout' && workoutType) {
    const config = workoutTypeConfig[workoutType];
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
          config.bgColor,
          config.color,
          className
        )}
        {...props}
      />
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        {
          'bg-primary text-primary-foreground': variant === 'default',
          'bg-secondary text-secondary-foreground': variant === 'secondary',
          'border border-border text-foreground': variant === 'outline',
        },
        className
      )}
      {...props}
    />
  );
}

export { Badge };
