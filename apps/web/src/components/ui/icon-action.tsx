import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface IconActionProps extends Omit<ButtonProps, "size"> {
  label: string;
  icon: React.ReactNode;
}

/**
 * Icon-only table-row action button with a hover tooltip naming what it
 * does — the standard shape for Edit/View/Delete-style actions in a table's
 * actions column across the web portal.
 */
export const IconAction = React.forwardRef<HTMLButtonElement, IconActionProps>(
  ({ label, icon, className, variant = "outline", ...props }, ref) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button ref={ref} type="button" size="icon" variant={variant} className={cn("h-8 w-8", className)} {...props}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
);
IconAction.displayName = "IconAction";
