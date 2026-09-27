import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { GitBranch } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { actions } from "./commandComposerModel";
import type { ComposerAction } from "./commandComposerModel";
import type { ComposerPane } from "./commandComposerFlow";

type CardProps = {
  label: string;
  value: string;
  previewKey?: string;
  icon: ReactNode;
  active: boolean;
  onPress: () => void;
};

export type ComposerCardStep = {
  id: string;
  label: string;
  value: string;
  previewKey?: string;
  icon: LucideIcon;
  active: boolean;
  onPress: () => void;
};

type CardSlot = {
  id: string;
  node: ReactNode;
};

type LeavingCard = CardSlot & {
  slot: number;
  count: number;
  direction: "left" | "right" | "stay";
  sequence: number;
};

function CommandCardFrame({ label, value, previewKey, icon, active, onPress }: CardProps) {
  return (
    <button
      type="button"
      className="change-composer-card"
      data-active={active}
      onClick={onPress}
      aria-label={`${label}: ${value}`}
    >
      {icon}
      <span className="change-composer-card-label">{label}</span>
      <span
        key={previewKey}
        className="change-composer-card-value"
        data-preview={previewKey !== undefined}
        title={value}
      >
        {value}
      </span>
    </button>
  );
}

function ActionPreviewIcon({
  previewAction,
  fallbackIcon: FallbackIcon,
}: {
  previewAction: ComposerAction | null;
  fallbackIcon: LucideIcon;
}) {
  return (
    <span className="change-composer-card-icon change-composer-icon-stack" aria-hidden="true">
      <FallbackIcon className="change-composer-icon-layer" data-visible={!previewAction} />
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
    </span>
  );
}

function AnimatedCardSlots({ cards }: { cards: CardSlot[] }) {
  const previousCardsRef = useRef(cards);
  const sequenceRef = useRef(0);
  const [leavingCard, setLeavingCard] = useState<LeavingCard | null>(null);

  useLayoutEffect(() => {
    const previousCards = previousCardsRef.current;
    const removedCard = previousCards.find(
      (previous) => !cards.some((current) => current.id === previous.id),
    );
    previousCardsRef.current = cards;

    if (!removedCard) return;

    const slot = previousCards.indexOf(removedCard);
    let direction: LeavingCard["direction"] = "stay";
    if (cards.length < previousCards.length) {
      direction = slot === 0 ? "right" : "left";
    }

    sequenceRef.current += 1;
    setLeavingCard({
      ...removedCard,
      slot,
      count: previousCards.length,
      direction,
      sequence: sequenceRef.current,
    });
  }, [cards]);

  useEffect(() => {
    if (!leavingCard) return;

    const timeout = window.setTimeout(() => {
      setLeavingCard((current) => (current?.sequence === leavingCard.sequence ? null : current));
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [leavingCard]);

  return (
    <div className="change-composer-cards">
      {cards.map(({ id, node }, index) => (
        <div key={id} className="change-composer-card-position" data-slot={index}>
          {node}
        </div>
      ))}
      {leavingCard && !cards.some((card) => card.id === leavingCard.id) ? (
        <div
          key={`exit-${leavingCard.sequence}`}
          className="change-composer-card-position change-composer-card-exit"
          data-slot={leavingCard.slot}
          data-exit-count={leavingCard.count}
          data-exit-direction={leavingCard.direction}
          aria-hidden="true"
          inert
        >
          {leavingCard.node}
        </div>
      ) : null}
    </div>
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
    const visibleCards = visibleSteps.map((step): CardSlot => {
      const Icon = step.icon;

      return {
        id: step.id,
        node: (
          <CommandCardFrame
            label={step.label}
            value={step.value}
            previewKey={step.previewKey}
            active={step.active}
            onPress={step.onPress}
            icon={
              step.id === "action" ? (
                <ActionPreviewIcon previewAction={previewAction} fallbackIcon={Icon} />
              ) : (
                <span className="change-composer-card-icon" aria-hidden="true">
                  <Icon className="size-8" />
                </span>
              )
            }
          />
        ),
      };
    });

    return (
      <div
        className="change-composer-card-surface"
        data-count={visibleSteps.length}
        data-progressive="true"
      >
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
        <AnimatedCardSlots cards={visibleCards} />
      </div>
    );
  }

  const hasOperandCard = objectFirst || pane === "choice" || pane === "review";
  const hasActionCard = !objectFirst || pane !== "choice";
  const actionCard = hasActionCard ? (
    <CommandCardFrame
      active={pane === "action" || pane === "execute"}
      label="Action"
      value={actionLabel}
      previewKey={previewAction ?? "choose"}
      onPress={onActionPress}
      icon={<ActionPreviewIcon previewAction={previewAction} fallbackIcon={PreviewIcon} />}
    />
  ) : null;
  const operandCard = hasOperandCard ? (
    <CommandCardFrame
      active={objectFirst ? pane === "choice" || pane === "review" : true}
      label={operandLabel}
      value={operandValue}
      previewKey={pane === "choice" ? operandValue : undefined}
      onPress={onOperandPress}
      icon={
        <span className="change-composer-card-icon" aria-hidden="true">
          <OperandIcon className="size-8" />
        </span>
      }
    />
  ) : null;

  const orderedCards = objectFirst
    ? [
        { id: "operand", node: operandCard },
        { id: "action", node: actionCard },
      ]
    : [
        { id: "action", node: actionCard },
        { id: "operand", node: operandCard },
      ];
  const visibleCards = orderedCards.filter(({ node }) => node !== null);

  return (
    <div
      className="change-composer-card-surface"
      data-count={visibleCards.length}
      data-object-first={objectFirst}
    >
      <div className="change-composer-card-history" />
      <AnimatedCardSlots cards={visibleCards} />
    </div>
  );
}
