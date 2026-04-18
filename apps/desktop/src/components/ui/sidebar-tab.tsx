import { Button } from "@base-ui/react";

type Props = {
  isActive: boolean;
  icon: React.ReactNode;
  onClick: () => void;
};

const SidebarTabButton = ({ isActive, icon, onClick }: Props) => {
  return (
    <Button
      type="button"
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
        isActive
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      }`}
      aria-label="Source control view"
      title="Source control view"
      onClick={onClick}
    >
      {icon}
    </Button>
  );
};

export default SidebarTabButton;
