import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "relative overflow-hidden bg-[var(--color-primary,#7C3AED)] text-white shadow-sm hover:opacity-90 hover:shadow-glow-sm hover:-translate-y-0.5 focus-visible:ring-[var(--color-primary,#7C3AED)] shimmer-hover",
        destructive:
          "bg-red-500 text-white shadow-sm hover:bg-red-600 hover:-translate-y-0.5 focus-visible:ring-red-500",
        outline:
          "border border-gray-200 bg-white text-gray-700 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700 hover:-translate-y-0.5 focus-visible:ring-[var(--color-primary,#7C3AED)]",
        secondary:
          "bg-violet-50 text-violet-700 hover:bg-violet-100 hover:-translate-y-0.5 focus-visible:ring-violet-300",
        ghost:
          "text-gray-600 hover:bg-violet-50 hover:text-violet-700 focus-visible:ring-violet-300",
        link:
          "text-[var(--color-primary,#7C3AED)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm:      "h-8 rounded-lg px-3 text-xs",
        lg:      "h-11 rounded-xl px-6 text-base",
        icon:    "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
