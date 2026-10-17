import * as React from "react";
import { cn } from "@/lib/utils";
import { resolveMediaUrl } from "@/lib/api";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Affiche une pastille de présence (vert = en ligne) quand défini */
  online?: boolean;
}

const sizeClasses = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-20 w-20 text-xl font-bold",
};

const dotClasses = {
  xs: "h-2 w-2 ring-[1.5px]",
  sm: "h-2.5 w-2.5 ring-2",
  md: "h-3 w-3 ring-2",
  lg: "h-3.5 w-3.5 ring-2",
  xl: "h-4 w-4 ring-[3px]",
};

export function Avatar({ src, alt, fallback = "U", size = "md", online, className, ...props }: AvatarProps) {
  const [hasError, setHasError] = React.useState(false);
  React.useEffect(() => setHasError(false), [src]);

  const circle = (
    <div
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full ring-2 ring-indigo-500/20 bg-gradient-to-tr from-slate-800 to-slate-700 items-center justify-center font-medium text-slate-200 select-none",
        sizeClasses[size],
        className
      )}
      {...(online === undefined ? props : {})}
    >
      {src && !hasError ? (
        <img
          src={resolveMediaUrl(src)}
          alt={alt || "Avatar"}
          loading="lazy"
          className="aspect-square h-full w-full object-cover"
          onError={() => setHasError(true)}
        />
      ) : (
        <span>{fallback.slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );

  if (online === undefined) return circle;

  return (
    <div className="relative inline-flex shrink-0" {...props}>
      {circle}
      <span
        className={cn(
          "absolute bottom-0 right-0 rounded-full ring-slate-900 transition-colors",
          dotClasses[size],
          online ? "bg-emerald-400" : "bg-slate-500"
        )}
        title={online ? "En ligne" : "Hors ligne"}
      />
    </div>
  );
}
