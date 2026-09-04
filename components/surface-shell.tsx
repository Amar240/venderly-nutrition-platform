import Link from "next/link";
import { PrototypeBanner } from "@/components/prototype-banner";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/actions/auth";
import type { Surface } from "@/server/auth/navigation";

export interface NavItem {
  label: string;
  href: string;
}

interface SurfaceShellProps {
  surface: Surface;
  /** The district's own name, read from the database by each layout. */
  brandName: string;
  surfaceLabel: string;
  identityLabel: string;
  roleLabel: string;
  navItems: NavItem[];
  children: React.ReactNode;
}

/*
 * Shared app shell for all three surfaces. `data-density` scales the tokens for
 * the whole surface. The prototype banner is the first thing under <main>'s
 * wrapper so it appears on every screen. One component set, differing only by
 * density (design-system.md).
 */
export function SurfaceShell({
  surface,
  brandName,
  surfaceLabel,
  identityLabel,
  roleLabel,
  navItems,
  children,
}: SurfaceShellProps) {
  return (
    <div data-density={surface} className="min-h-screen bg-surface text-ink">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <PrototypeBanner />
      <header className="border-b border-border bg-surface-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4 sm:gap-6">
            <Link href="/" className="flex min-h-touch flex-col justify-center leading-tight">
              <span className="text-lg font-medium text-ink">{brandName}</span>
              <span className="text-xs text-ink-muted">{surfaceLabel}</span>
            </Link>
            {navItems.length > 0 && (
              <nav aria-label={`${surfaceLabel} navigation`} className="w-full sm:w-auto">
                <ul className="flex flex-wrap items-center gap-2 sm:gap-4">
                  {navItems.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="flex min-h-touch items-center rounded-control px-2 py-1 text-sm text-ink-muted hover:bg-brand-wash"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
          <div className="flex items-center gap-3" data-print-hidden="true">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium text-ink">{identityLabel}</div>
              <div className="text-xs text-ink-muted">{roleLabel}</div>
            </div>
            <form action={signOutAction}>
              <Button variant="secondary" size="md" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
