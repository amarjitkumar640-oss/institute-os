import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-xl px-2.5 py-0.5 text-xs font-semibold transition-colors select-none",
  {
    variants: {
      variant: {
        default:  "bg-gray-100 text-gray-600",
        primary:  "bg-violet-100 text-violet-700",
        success:  "bg-emerald-50 text-emerald-700",
        warning:  "bg-amber-50 text-amber-700",
        danger:   "bg-red-50 text-red-600",
        info:     "bg-blue-50 text-blue-700",
        purple:   "bg-violet-50 text-violet-700",
        outline:  "border border-gray-200 text-gray-600 bg-transparent",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
