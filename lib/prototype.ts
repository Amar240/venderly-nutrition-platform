/*
 * Exact prototype notice required in every UI surface and exported/printed
 * output. Keep this module presentation-free so server serializers can import it.
 */
export const PROTOTYPE_BANNER_TEXT =
  "Prototype with synthetic data. Not connected to a student information system, a point-of-sale system, or live payment processing.";

/*
 * D-21: the deeper meal-history seed keeps 200 synthetic students rather than
 * Woodbridge's real ~2,720 enrolment, so monthly totals read far below what a
 * district this size actually claims. Named plainly everywhere claim figures
 * appear — the claim-figures screen and the claim pack must use this exact
 * wording so they can never drift.
 */
export const DEMO_SCALE_DISCLOSURE =
  "This prototype contains 200 synthetic students, so these totals are not district-scale figures.";

/*
 * The product name shown in the app header, the sign-in heading, and inside an
 * authenticator app. Env-overridable so a district-branded build is a setting
 * rather than a code change.
 */
export const APP_BRAND_NAME = process.env.NEXT_PUBLIC_APP_BRAND_NAME ?? "Venderly Nutrition Platform";
