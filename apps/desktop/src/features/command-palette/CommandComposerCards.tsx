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

export type ComposerCardStep = {
  id: string;
  label: string;
  value: string;
  icon: LucideIcon;
  active: boolean;
  onPress: () => void;
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
  steps?: readonly ComposerCardStep[];
  actionLabel: string;
  previewAction: ComposerAction | null;
  previewIcon?: LucideIcon;
  operandLabel: string;
  operandValue: string;
  operandIcon: LucideIcon;
  objectFirst?: boolean;
  onActionPress: () => void;
  onOperandPress: () => void;
};

export function CommandComposerCards({
  pane,
  steps,
  actionLabel,
  previewAction,
  previewIcon: PreviewIcon = GitBranch,
  operandLabel,
  operandValue,
  operandIcon: OperandIcon,
  objectFirst = false,
  onActionPress,
  onOperandPress,
}: Props) {
  if (steps) {
    const olderSteps = steps.slice(0, -3);
    const visibleSteps = steps.slice(-3);

    return (
      <div
        className="change-composer-card-surface"
        data-count={visibleSteps.length}
        data-progressive="true"
      >
        {olderSteps.length ? (
          <div className="change-composer-card-history" aria-label="Earlier command steps">
            {olderSteps.map((step) => (
              <button
                key={step.id}
                type="button"
                className="change-composer-card-history-item"
                onClick={step.onPress}
                title={`${step.label}: ${step.value}`}
              >
                {step.label}: {step.value}
              </button>
            ))}
          </div>
        ) : null}
        <div className="change-composer-cards">
          {visibleSteps.map((step) => {
            const Icon = step.icon;

            return (
              <CommandCardFrame
                key={step.id}
                label={step.label}
                value={step.value}
                active={step.active}
                onPress={step.onPress}
                icon={
                  <span className="change-composer-card-icon" aria-hidden="true">
                    <Icon className="size-8" />
                  </span>
                }
              />
            );
          })}
        </div>
      </div>
    );
  }

  const hasOperandCard = objectFirst || pane === "choice" || pane === "review";
  const hasActionCard = !objectFirst || pane !== "choice";
  const actionCard = hasActionCard ? (
    <CommandCardFrame
      className="change-composer-action-card"
      active={pane === "action" || pane === "execute"}
      label="Action"
      value={actionLabel}
      onPress={onActionPress}
      icon={
        <span className="change-composer-card-icon change-composer-icon-stack" aria-hidden="true">
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
          {!previewAction ? <PreviewIcon className="size-8" /> : null}
        </span>
      }
    />
  ) : null;
  const operandCard = hasOperandCard ? (
    <CommandCardFrame
      active={objectFirst ? pane === "choice" || pane === "review" : true}
      label={operandLabel}
      value={operandValue}
      onPress={onOperandPress}
      icon={
        <span className="change-composer-card-icon" aria-hidden="true">
          <OperandIcon className="size-8" />
        </span>
      }
    />
  ) : null;

  return (
    <div
      className="change-composer-card-surface"
      data-count={hasOperandCard && hasActionCard ? "2" : "1"}
      data-object-first={objectFirst}
    >
      <div className="change-composer-cards">
        {objectFirst ? operandCard : actionCard}
        {objectFirst ? actionCard : operandCard}
      </div>
    </div>
  );
}
