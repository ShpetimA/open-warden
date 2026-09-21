import { Button } from "@base-ui/react";

import { cn } from "@/lib/utils";

type Props = {
  isActive: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
};

const SidebarTabButton = ({ isActive, icon, label, onClick }: Props) => {
  return (
    <Button
      type="button"
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-md outline-none transition-[background-color,color] focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0",
        isActive
          ? "bg-surface-elevated text-foreground shadow-xs ring-1 ring-border/60"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
      aria-current={isActive ? "page" : undefined}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
};

export default SidebarTabButton;
