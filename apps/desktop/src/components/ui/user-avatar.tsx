import { Bot } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type UserAvatarProps = Readonly<{
  login: string;
  name?: string | null;
  avatarUrl?: string | null;
  isBot?: boolean;
  size?: "xs" | "sm" | "md";
  showTooltip?: boolean;
  className?: string;
}>;

const sizeClasses = {
  xs: "size-4 text-[8px]",
  sm: "size-5 text-[9px]",
  md: "size-7 text-[10px]",
} as const;

const fallbackHues = [12, 48, 96, 156, 196, 228, 268, 312];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}`;
  return name.slice(0, 2);
}

function hueFor(login: string) {
  let hash = 0;
  for (const character of login) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return fallbackHues[Math.abs(hash) % fallbackHues.length];
}

function UserAvatar({
  login,
  name,
  avatarUrl,
  isBot = false,
  size = "md",
  showTooltip = false,
  className,
}: UserAvatarProps) {
  const label = name && name !== login ? `${name} (${login})` : login;
  const avatar = avatarUrl ? (
    <img
      alt={label}
      src={avatarUrl}
      className={cn(
        "ring-background shrink-0 rounded-full object-cover ring-1",
        sizeClasses[size],
        className,
      )}
    />
  ) : (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "ring-background inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white uppercase ring-1",
        sizeClasses[size],
        className,
      )}
      style={{ backgroundColor: `oklch(0.6 0.12 ${hueFor(login)})` }}
    >
      {isBot ? <Bot className="size-3/5" /> : initials(name || login)}
    </span>
  );

  if (!showTooltip) return avatar;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{avatar}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

export { UserAvatar };
export type { UserAvatarProps };
