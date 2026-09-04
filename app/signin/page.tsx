import Image from "next/image";
import { redirect } from "next/navigation";
import { getAppSession } from "@/server/auth/session";
import { roleHome } from "@/server/auth/navigation";
import { PrototypeBanner } from "@/components/prototype-banner";
import { demoSignInHints } from "@/server/auth/demoCredentials";
import { SignInForm } from "./sign-in-form";
import { APP_BRAND_NAME } from "@/lib/prototype";
import { DemoCredentials } from "./demo-credentials";

// Codes are valid for 30 seconds, so this page must never be cached.
export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const session = await getAppSession();
  if (session) redirect(roleHome(session));

  const demoHints = await demoSignInHints();
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "Demo!Pass1";

  return (
    <div className="min-h-screen bg-surface" data-density="guardian">
      <PrototypeBanner />
      <div className="mx-auto flex max-w-md flex-col px-4 py-16">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-medium text-ink">{APP_BRAND_NAME}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Sign in to your account
          </p>
        </div>
        <div className="rounded-card border border-border bg-surface-card p-6">
          <SignInForm />
        </div>
        <DemoCredentials hints={demoHints} password={demoPassword} />

        {/*
          The mark alone: the heading above already says "Venderly Nutrition
          Platform" and the logo carries its own wordmark, so any accompanying
          text would be the third mention on one screen.

          It also deliberately claims nothing. A sign-in page that paired a
          district's name with a vendor's could be screenshotted and read as an
          adoption the district has not made.
        */}
        <footer className="mt-8 flex items-center justify-center">
          <Image
            src="/venderly-logo.png"
            alt="Venderly"
            width={4800}
            height={2400}
            priority={false}
            className="h-8 w-auto"
          />
        </footer>
      </div>
    </div>
  );
}
