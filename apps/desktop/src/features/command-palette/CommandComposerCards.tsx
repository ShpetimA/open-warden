import type { ReactNode } from "react";
import { GitBranch } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { actions } from "./commandComposerModel";
import type { ComposerAction } from "./commandComposerModel";
import type { ComposerPane } from "./commandComposerFlow";

type CardProps = {
  label: string;
  value: string;
  icon: ReactNode;
  active: boolean;
  onPress: () => void;
  className?: string;
};

function CommandCardFrame({ label, value, icon, active, onPress, className = "" }: CardProps) {
  return (
    <button
      type="button"
      className={`change-composer-card ${className}`}
      data-active={active}
      onClick={onPress}
      aria-label={`${label}: ${value}`}
    >
      {icon}
      <span className="change-composer-card-label">{label}</span>
      <span className="change-composer-card-value" title={value}>
        {value}
      </span>
    </button>
  );
}

type Props = {
  pane: ComposerPane;
  actionLabel: string;
  previewAction: ComposerAction | null;
  operandLabel: string;
  operandValue: string;
  operandIcon: LucideIcon;
  onActionPress: () => void;
  onOperandPress: () => void;
};

export function CommandComposerCards({
  pane,
  actionLabel,
  previewAction,
  operandLabel,
  operandValue,
  operandIcon: OperandIcon,
  onActionPress,
  onOperandPress,
}: Props) {
  const hasOperandCard = pane === "choice" || pane === "review";
  return (
    <div className="change-composer-card-surface" data-count={hasOperandCard ? "2" : "1"}>
      <div className="change-composer-cards">
        <CommandCardFrame
          className="change-composer-action-card"
          active={pane === "action" || pane === "execute"}
          label="Action"
          value={actionLabel}
          onPress={onActionPress}
          icon={
            <span
              className="change-composer-card-icon change-composer-icon-stack"
              aria-hidden="true"
            >
              {actions.map((item) => {
                const Icon = item.icon;
                return (
                  <Icon
                    key={item.id}
                    className="change-composer-icon-layer"
                    data-visible={previewAction === item.id}
                  />
                );
              })}
              {!previewAction ? <GitBranch className="size-8" /> : null}
            </span>
          }
        />
        {hasOperandCard ? (
          <CommandCardFrame
            active
            label={operandLabel}
            value={operandValue}
            onPress={onOperandPress}
            icon={
              <span className="change-composer-card-icon" aria-hidden="true">
                <OperandIcon className="size-8" />
              </span>
            }
          />
        ) : null}
      </div>
    </div>
  );
}
