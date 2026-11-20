"use client";

import { Check } from "lucide-react";

export type FlowStep = "connect" | "summary" | "plan" | "members";

type ConnectStepperProps = {
  currentStep: FlowStep;
};

const STEPS: { key: FlowStep; label: string; number: number }[] = [
  { key: "connect", label: "Connect", number: 1 },
  { key: "summary", label: "Review summary", number: 2 },
  { key: "plan", label: "Review plan", number: 3 },
  { key: "members", label: "Invite team", number: 4 },
];

export function ConnectStepper({ currentStep }: ConnectStepperProps) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <nav aria-label="Project setup progress" className="connect-stepper-container">
      <ol className="connect-stepper">
        {STEPS.map((step, index) => {
          const isDone = index < currentIndex;
          const isCurrent = index === currentIndex;

          let stepClass = "stepper-step";
          if (isDone) stepClass += " done";
          if (isCurrent) stepClass += " current";

          return (
            <li
              aria-current={isCurrent ? "step" : undefined}
              className={stepClass}
              key={step.key}
            >
              <div className="stepper-bubble">
                {isDone ? (
                  <Check aria-hidden="true" className="stepper-check" size={13} strokeWidth={3} />
                ) : (
                  <span>{step.number}</span>
                )}
              </div>
              <span className="stepper-label">{step.label}</span>
              {index < STEPS.length - 1 && (
                <div
                  aria-hidden="true"
                  className={`stepper-connector ${index < currentIndex ? "connector-done" : ""}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
