import { prisma } from "@/server/db/client";
import { recordDeposit } from "@/server/ledger/ledger";
import { writeAudit } from "@/server/audit/log";

/**
 * PaymentPort — the boundary between guardian deposit flows and a payment
 * provider (CLAUDE.md rule 13). Phase 2 ships SimulatedPaymentPort; phase 8
 * swaps a StripePaymentPort behind the same interface with no domain changes.
 * No vendor SDK is imported anywhere outside an implementation of this port.
 *
 * The critical guarantee: a ledger credit is applied ONLY by `settle()`, which
 * reads the authoritative amount from the persisted PaymentIntent — never from
 * a client redirect. `settle()` reads no session state.
 */

export interface CheckoutAllocation {
  studentId: string;
  amountCents: number;
}

export interface CreateCheckoutInput {
  guardianId: string;
  allocations: CheckoutAllocation[];
  automaticTopUpRunId?: string;
}

export interface CreateCheckoutResult {
  checkoutId: string;
  redirectUrl: string;
}

export interface SettleResult {
  intentId: string;
  eventId: string;
  guardianId: string;
  allocations: CheckoutAllocation[];
  automaticTopUpRunId: string | null;
  /** True when the intent was already settled — this call credited nothing. */
  alreadySettled: boolean;
}

export class PaymentError extends Error {
  constructor(
    public code: "INTENT_NOT_FOUND" | "NO_ALLOCATIONS",
    message: string,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

export interface PaymentPort {
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  settle(input: { intentId: string; eventId: string }): Promise<SettleResult>;
}

class SimulatedPaymentPort implements PaymentPort {
  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    if (input.allocations.length === 0) {
      throw new PaymentError("NO_ALLOCATIONS", "A deposit needs at least one allocation");
    }
    const totalCents = input.allocations.reduce((sum, a) => sum + a.amountCents, 0);
    const intent = await prisma.paymentIntent.create({
      data: {
        guardianId: input.guardianId,
        totalCents,
        automaticTopUpRunId: input.automaticTopUpRunId ?? null,
        allocations: {
          create: input.allocations.map((a) => ({
            studentId: a.studentId,
            amountCents: a.amountCents,
          })),
        },
      },
    });
    return {
      checkoutId: intent.id,
      redirectUrl: `/guardian/checkout/${intent.id}`,
    };
  }

  /**
   * Settle the intent for a verified provider event. Idempotent:
   *  - the per-allocation ledger idempotencyKey is `${eventId}:${studentId}`,
   *  - `eventId` is deterministic per intent, so any replay reuses those keys
   *    and credits nothing further,
   *  - a fast-path returns early once the intent is COMPLETED.
   * Reads no session — callable only from the verified webhook.
   */
  async settle(input: { intentId: string; eventId: string }): Promise<SettleResult> {
    const intent = await prisma.paymentIntent.findUnique({
      where: { id: input.intentId },
      include: { allocations: true },
    });
    if (!intent) {
      throw new PaymentError("INTENT_NOT_FOUND", `Unknown intent ${input.intentId}`);
    }
    const allocations: CheckoutAllocation[] = intent.allocations.map((a) => ({
      studentId: a.studentId,
      amountCents: a.amountCents,
    }));

    if (intent.status === "COMPLETED") {
      return {
        eventId: intent.eventId ?? input.eventId,
        intentId: intent.id,
        guardianId: intent.guardianId,
        allocations,
        automaticTopUpRunId: intent.automaticTopUpRunId,
        alreadySettled: true,
      };
    }

    await prisma.$transaction(async (tx) => {
      for (const alloc of intent.allocations) {
        await recordDeposit(
          {
            studentId: alloc.studentId,
            amountCents: alloc.amountCents,
            idempotencyKey: `${input.eventId}:${alloc.studentId}`,
            actor: { actorType: "SYSTEM" },
            description: "Payment (simulated checkout)",
          },
          tx,
        );
      }
      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: { status: "COMPLETED", eventId: input.eventId, completedAt: new Date() },
      });
    });

    await writeAudit({
      actorType: "SYSTEM",
      action: "DEPOSIT_SETTLED",
      subjectType: "paymentIntent",
      subjectId: intent.id,
      after: { eventId: input.eventId, totalCents: intent.totalCents },
    });

    return {
      eventId: input.eventId,
      intentId: intent.id,
      guardianId: intent.guardianId,
      allocations,
      automaticTopUpRunId: intent.automaticTopUpRunId,
      alreadySettled: false,
    };
  }
}

/** The port instance the app uses. Swap the class in phase 8. */
export const paymentPort: PaymentPort = new SimulatedPaymentPort();
