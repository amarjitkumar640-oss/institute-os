import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
      <div className="relative mb-5">
        <div className="h-20 w-20 rounded-3xl flex items-center justify-center bg-violet-50">
          <Icon className="h-9 w-9 text-violet-400" />
        </div>
        <div className="absolute inset-0 rounded-3xl blur-xl -z-10 opacity-40 bg-violet-200" />
      </div>
      <h3 className="text-base font-bold text-gray-900 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-gray-400 max-w-xs leading-relaxed">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button className="mt-5" onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}
