import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm shadow-sm transition-all",
      "placeholder:text-gray-400 text-gray-900",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary,#7C3AED)]/20 focus-visible:border-[var(--color-primary,#7C3AED)]",
      "hover:border-violet-200",
      "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50",
      "file:border-0 file:bg-transparent file:text-sm file:font-medium",
      className
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
