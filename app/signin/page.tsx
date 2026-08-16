import Image from "next/image";
import { redirect } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import { roleHome } from "@/server/auth/navigation";
import { PrototypeBanner } from "@/components/prototype-banner";
import { demoSignInHints } from "@/server/auth/demoCredentials";
import { SignInForm } from "./sign-in-form";
import { DemoCredentials } from "./demo-credentials";

// Codes are valid for 30 seconds, so this page must never be cached.
export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const session = await getAppSession();
  if (session) redirect(roleHome(session));

  const demoHints = await demoSignInHints();
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "Woodbridge!Demo1";

  return (
    <div className="min-h-screen bg-surface" data-density="guardian">
      <PrototypeBanner />
      <div className="mx-auto flex max-w-md flex-col px-4 py-16">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-medium text-ink">Woodbridge Nutrition</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Sign in to your account
          </p>
        </div>
        <div className="rounded-card border border-border bg-surface-card p-6">
          <SignInForm />
        </div>
        <DemoCredentials hints={demoHints} password={demoPassword} />

        {/*
          Attribution sits below the card rather than above the heading: the
          district's name leads, the vendor's closes. "Built by" is a plain
          authorship statement — it claims no adoption or endorsement by
          Woodbridge, which a sign-in screenshot could otherwise imply.
        */}
        <footer className="mt-8 flex items-center justify-center gap-2">
          <span className="text-xs text-ink-muted">Built by</span>
          <Image
            src="/venderly-logo.png"
            alt="Venderly"
            width={1230}
            height={500}
            priority={false}
            className="h-6 w-auto"
          />
        </footer>
      </div>
    </div>
  );
}
