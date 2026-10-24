import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-xs font-semibold ring-offset-slate-950 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20 hover:shadow-lg hover:shadow-amber-500/30 hover:brightness-110 active:scale-[0.98] border border-amber-300/40',
        rpgGold:
          'bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400 text-slate-950 font-extrabold rpg-font shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:scale-[1.02] active:scale-[0.99] border border-amber-300',
        rpgBlue:
          'bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 text-white font-bold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.02] active:scale-[0.99] border border-blue-300/40',
        secondary:
          'bg-slate-900/80 text-slate-200 border border-slate-700/60 shadow-sm hover:bg-slate-800 hover:text-white hover:border-amber-500/40 active:scale-[0.98]',
        destructive:
          'bg-red-600/90 text-white border border-red-500/40 hover:bg-red-600 hover:shadow-md hover:shadow-red-500/20 active:scale-[0.98]',
        outline:
          'border border-slate-700 bg-transparent hover:bg-slate-800/60 hover:text-slate-100 text-slate-300',
        ghost:
          'hover:bg-slate-800/60 text-slate-300 hover:text-white',
        icon:
          'w-11 h-11 p-0 rounded-xl bg-slate-900/80 border border-white/10 text-slate-300 hover:bg-slate-800 hover:text-amber-300 hover:border-amber-500/40 active:scale-95 shadow-md',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-12 rounded-xl px-6 text-sm',
        icon: 'h-11 w-11 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
