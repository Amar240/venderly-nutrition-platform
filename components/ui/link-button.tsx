import Link from "next/link";
import type { ComponentProps } from "react";
import type { VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

/**
 * A next/link styled as a button, using the SAME buttonVariants tokens. Use this
 * for navigation that should look like a button — the Button component itself is
 * for real <button> actions and isn't compatible with Slot/asChild here.
 */
export function LinkButton({
  className,
  variant,
  size,
  ...props
}: ComponentProps<typeof Link> & VariantProps<typeof buttonVariants>) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
