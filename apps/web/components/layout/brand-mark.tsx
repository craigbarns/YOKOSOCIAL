import { cn } from "@yokosocial/ui";

export function BrandMark({
  compact = false,
  className
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-rose-400 to-orange-400 shadow-lg shadow-rose-950/20">
        <span className="absolute h-7 w-2 -rotate-12 rounded-full bg-white/95" />
        <span className="bg-yoko-ink absolute mt-1 ml-3 size-2.5 rounded-full" />
      </span>
      {!compact && (
        <span>
          <span className="block text-[15px] leading-none font-bold tracking-tight text-current">
            YokoSushi
          </span>
          <span className="mt-1 block text-[10px] leading-none font-semibold tracking-[0.18em] text-current/55 uppercase">
            Social Agent
          </span>
        </span>
      )}
    </div>
  );
}
