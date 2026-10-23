import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

function formatRelativeTime(value: string, now = Date.now()) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "unknown time";
  const seconds = Math.round((time - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });
  for (const [unit, unitSeconds] of units) {
    if (Math.abs(seconds) >= unitSeconds) {
      return formatter.format(Math.round(seconds / unitSeconds), unit);
    }
  }
  return "just now";
}

function formatAbsoluteTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

type RelativeTimeProps = Readonly<{ value: string; prefix?: string; className?: string }>;

function RelativeTime({ value, prefix, className }: RelativeTimeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={value} className={cn("tabular-nums", className)}>
          {prefix ? `${prefix} ` : ""}
          {formatRelativeTime(value)}
        </time>
      </TooltipTrigger>
      <TooltipContent side="top">{formatAbsoluteTime(value)}</TooltipContent>
    </Tooltip>
  );
}

export { formatAbsoluteTime, formatRelativeTime, RelativeTime };
