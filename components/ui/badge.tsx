import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-amber-500/40 bg-amber-500/10 text-amber-300 shadow-sm shadow-amber-500/10',
        master:
          'border-amber-400/50 bg-gradient-to-r from-amber-500/20 to-amber-600/30 text-amber-300 font-extrabold shadow-sm',
        player:
          'border-blue-400/50 bg-gradient-to-r from-blue-500/20 to-cyan-500/30 text-blue-300 font-bold shadow-sm',
        npc:
          'border-red-500/40 bg-red-500/20 text-red-300 font-bold',
        secondary:
          'border-slate-700 bg-slate-800/80 text-slate-300',
        outline: 'border-slate-600 text-slate-300',
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
