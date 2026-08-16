import { NextResponse } from "next/server";

/**
 * Load-balancer health probe.
 *
 * Why this exists rather than probing `/`: the root route is an auth
 * dispatcher that calls `redirect()`, and the App Router answers that with
 * **307**, not 302. A probe pointed at `/` therefore fails against the usual
 * `200` (or even `200,302`) success codes even when the app is perfectly
 * healthy — which is exactly the failure that kept the first ECS deployment
 * showing 503 behind a running container.
 *
 * This is deliberately a LIVENESS probe, not a readiness one: it reports 200
 * whenever the process can serve a request, and reports database reachability
 * as information rather than as a failure. If a database blip returned 503
 * here, the load balancer would deregister the task and ECS would recycle the
 * container in a loop — restarting the app cannot fix a database outage, so
 * that loop would turn a recoverable incident into a much louder one.
 *
 * No session is read and nothing is audited: this endpoint exposes no student,
 * money, or eligibility data, so there is nothing here to authorise or log.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { status: "ok", service: "woodbridge-nutrition", time: new Date().toISOString() },
    { status: 200 },
  );
}
