import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-white/[0.08] bg-slate-800 text-slate-300',
        master:
          'border-amber-400/25 bg-amber-400/10 text-amber-300',
        player:
          'border-white/[0.08] bg-slate-800 text-slate-200',
        npc:
          'border-red-400/25 bg-red-500/10 text-red-300',
        secondary:
          'border-white/[0.08] bg-slate-800 text-slate-400',
        outline: 'border-white/10 text-slate-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
