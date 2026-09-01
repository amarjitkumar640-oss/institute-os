import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TruncatedTextProps {
  text: string | null | undefined;
  className?: string;
  /** Applied to the tooltip content, e.g. to widen it for longer text */
  tooltipClassName?: string;
}

/**
 * Single-line truncated text with an ellipsis, showing the full value in a
 * tooltip on hover — used for table cells that must never wrap a row onto
 * multiple lines.
 */
export function TruncatedText({ text, className, tooltipClassName }: TruncatedTextProps) {
  const value = text ?? "—";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("block truncate", className)}>{value}</span>
      </TooltipTrigger>
      <TooltipContent className={cn("max-w-xs break-words", tooltipClassName)}>{value}</TooltipContent>
    </Tooltip>
  );
}
