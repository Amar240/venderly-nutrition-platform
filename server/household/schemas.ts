import { z } from "zod";

/**
 * Zod validation for guardian money inputs (CLAUDE.md: validate at the boundary;
 * money is positive integer cents). The `≤ source balance` rule for transfers is
 * enforced live in server/ledger against the derived balance, not here.
 */

export const positiveCents = z.number().int().positive();

export const depositAllocationSchema = z.object({
  studentId: z.string().min(1),
  amountCents: positiveCents,
});

export const depositSchema = z.object({
  allocations: z.array(depositAllocationSchema).min(1, "Enter an amount for at least one child"),
});

export const transferSchema = z
  .object({
    fromStudentId: z.string().min(1),
    toStudentId: z.string().min(1),
    amountCents: positiveCents,
  })
  .refine((v) => v.fromStudentId !== v.toStudentId, {
    message: "Choose two different children",
    path: ["toStudentId"],
  });

export const automaticTopUpSchema = z
  .object({
    studentId: z.string().min(1),
    triggerBalanceCents: z.number().int().min(0),
    topUpAmountCents: positiveCents,
    monthlyCeilingCents: positiveCents,
  })
  .refine((v) => v.monthlyCeilingCents >= v.topUpAmountCents, {
    message: "The monthly limit must be at least the top-up amount.",
    path: ["monthlyCeilingCents"],
  });

export type DepositInput = z.infer<typeof depositSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type AutomaticTopUpInput = z.infer<typeof automaticTopUpSchema>;
