import { ChevronRight } from "lucide-react";

import type { ComposerPane } from "./commandComposerFlow";

export type ComposerContextStep = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly active: boolean;
  readonly onPress: () => void;
};

type Props = {
  readonly pane: ComposerPane;
  readonly steps?: readonly ComposerContextStep[];
  readonly actionLabel: string;
  readonly operandLabel: string;
  readonly operandValue: string;
  readonly objectFirst?: boolean;
  readonly onActionPress: () => void;
  readonly onOperandPress: () => void;
};

export function CommandComposerContext({
  pane,
  steps,
  actionLabel,
  operandLabel,
  operandValue,
  objectFirst = false,
  onActionPress,
  onOperandPress,
}: Props) {
  let contextSteps = steps;

  if (!contextSteps) {
    const actionStep: ComposerContextStep = {
      id: "action",
      label: "Action",
      value: actionLabel,
      active: pane === "action",
      onPress: onActionPress,
    };
    const operandStep: ComposerContextStep = {
      id: "operand",
      label: operandLabel,
      value: operandValue,
      active: pane === "choice",
      onPress: onOperandPress,
    };

    if (pane === "action" && !objectFirst) {
      contextSteps = [{ ...actionStep, value: "Quick actions" }];
    } else if (objectFirst) {
      contextSteps = pane === "choice" ? [operandStep] : [operandStep, actionStep];
    } else {
      contextSteps = [actionStep, operandStep];
    }
  }

  return (
    <nav className="change-composer-context" aria-label="Command steps">
      <ol>
        {contextSteps.map((step, index) => {
          const choosing = step.active && (pane === "action" || pane === "choice");
          let value = step.value;

          if (choosing && steps) value = `Choose ${step.label.toLowerCase()}`;
          else if (choosing && pane === "choice") value = `Choose ${operandLabel.toLowerCase()}`;

          return (
            <li key={step.id}>
              {index > 0 ? <ChevronRight aria-hidden="true" /> : null}
              {choosing ? (
                <span aria-current="step" className="change-composer-context-current">
                  {value}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={step.onPress}
                  aria-label={`${step.label}: ${step.value}`}
                  title={step.value}
                >
                  {value}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
