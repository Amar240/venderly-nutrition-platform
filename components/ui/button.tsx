import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { SpinnerIcon } from "@/components/icons";

/*
 * One Button for all three surfaces. Size follows density automatically via
 * spacing tokens; POS meets the 48px minimum through the density-scaled
 * min-h/min-w. Variants and states per docs/design-system.md.
 */
const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 rounded-control font-medium " +
    "min-h-touch transition-[filter,background-color,color] duration-150 " +
    "disabled:opacity-50 disabled:pointer-events-none select-none",
  {
    variants: {
      variant: {
        primary: "bg-brand text-white hover:brightness-95 active:brightness-90",
        secondary:
          "border border-border text-ink-muted bg-surface-card hover:bg-brand-wash active:brightness-95",
        ghost: "text-ink-muted bg-transparent hover:bg-brand-wash",
        danger: "bg-danger text-white hover:brightness-95 active:brightness-90",
      },
      size: {
        md: "px-4 py-2 text-base",
        lg: "px-6 py-3 text-lg min-w-touch",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, children, disabled, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <SpinnerIcon className="animate-spin" aria-hidden />
          </span>
        )}
        {/* Keep width stable while loading. */}
        <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>
          {children}
        </span>
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
