import { InfoIcon } from "@/components/icons";
import type { DemoSignInHint } from "@/server/auth/demoCredentials";

/**
 * Prototype-only sign-in hints. Rendered on the server so the codes are
 * generated at request time; nothing here is interactive and no secret is
 * sent to the browser — only the six digits valid at render.
 *
 * Codes roll every 30 seconds, so this says so plainly rather than letting an
 * evaluator conclude the product is broken when a stale code is rejected.
 */
export function DemoCredentials({
  hints,
  password,
}: {
  hints: DemoSignInHint[];
  password: string;
}) {
  if (hints.length === 0) return null;

  return (
    <div
      role="note"
      className="mt-6 rounded-card border border-control-border bg-warn-wash p-4 text-sm text-ink"
    >
      <div className="flex items-start gap-2">
        <InfoIcon className="mt-0.5 shrink-0 text-warn" />
        <div className="min-w-0">
          <p className="font-medium">Prototype sign-in</p>
          <p className="mt-1 text-ink-muted">
            Staff accounts are protected by a second factor. So you don&apos;t need an
            authenticator app to look around, the current code is shown here. It
            changes every 30 seconds — if one is rejected, reload for a fresh code.
          </p>

          <p className="mt-3">
            Password for every account: <span className="font-mono">{password}</span>
          </p>

          <table className="mt-3 w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-control-border text-xs uppercase tracking-wide text-ink-muted">
                <th scope="col" className="py-1 pr-3 font-medium">Role</th>
                <th scope="col" className="py-1 pr-3 font-medium">Email</th>
                <th scope="col" className="py-1 font-medium">Code</th>
              </tr>
            </thead>
            <tbody>
              {hints.map((hint) => (
                <tr key={hint.email} className="border-b border-control-border/50 last:border-0">
                  <td className="py-1.5 pr-3 align-top">{hint.label}</td>
                  <td className="py-1.5 pr-3 align-top font-mono text-xs break-all">{hint.email}</td>
                  <td className="py-1.5 align-top font-mono">
                    {hint.code ?? <span className="text-ink-muted">not needed</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
