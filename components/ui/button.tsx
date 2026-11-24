import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-xs font-medium ring-offset-slate-950 transition-[color,background-color,border-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
  {
    variants: {
      variant: {
        default:
          'bg-amber-400 text-slate-950 border border-amber-300/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-amber-300 active:scale-[0.98]',
        rpgGold:
          'bg-amber-400 text-slate-950 border border-amber-300/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-amber-300 active:scale-[0.98]',
        rpgBlue:
          'bg-slate-100 text-slate-950 border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] hover:bg-white active:scale-[0.98]',
        secondary:
          'bg-slate-800 text-slate-200 border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-slate-700 hover:text-white active:scale-[0.98]',
        destructive:
          'bg-red-700 text-white border border-red-500/30 hover:bg-red-600 active:scale-[0.98]',
        outline:
          'border border-white/10 bg-transparent hover:bg-slate-800/60 hover:text-slate-100 text-slate-300',
        ghost:
          'hover:bg-slate-800/60 text-slate-300 hover:text-white',
        icon:
          'w-11 h-11 p-0 rounded-lg bg-slate-800 border border-white/[0.08] text-slate-300 hover:bg-slate-700 hover:text-white active:scale-[0.97]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-12 rounded-lg px-6 text-sm',
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
