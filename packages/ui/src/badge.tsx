import type * as React from "react";

import { cn } from "./utils.js";

const styles = {
  slate: "bg-slate-100 text-slate-700",
  green: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  rose: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  blue: "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
} as const;

export function Badge({
  tone = "slate",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof styles }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        styles[tone],
        className
      )}
      {...props}
    />
  );
}
