"use client";

import { Button } from "@/components/ui/button";

/**
 * On-screen numeric keypad for POS. Large (≥48px via POS density) touch targets;
 * every action is also reachable by physical keyboard on the paired input.
 */
export function NumericKeypad({
  onDigit,
  onBackspace,
  onClear,
  onEnter,
  disabled,
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onEnter: () => void;
  disabled?: boolean;
}) {
  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return (
    <div className="grid grid-cols-3 gap-2">
      {digits.map((d) => (
        <Button
          key={d}
          type="button"
          variant="secondary"
          size="lg"
          disabled={disabled}
          onClick={() => onDigit(d)}
          aria-label={`Digit ${d}`}
        >
          {d}
        </Button>
      ))}
      <Button type="button" variant="ghost" size="lg" disabled={disabled} onClick={onClear}>
        Clear
      </Button>
      <Button type="button" variant="secondary" size="lg" disabled={disabled} onClick={() => onDigit("0")} aria-label="Digit 0">
        0
      </Button>
      <Button type="button" variant="ghost" size="lg" disabled={disabled} onClick={onBackspace} aria-label="Backspace">
        ⌫
      </Button>
      <Button type="button" size="lg" disabled={disabled} onClick={onEnter} className="col-span-3">
        Enter
      </Button>
    </div>
  );
}
