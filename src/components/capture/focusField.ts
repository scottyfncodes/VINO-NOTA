/**
 * Where each validation error is shown. Keys are the error keys returned by
 * validateIdentity / validateTasting; values select the control to focus.
 */
const ERROR_TARGETS: Record<string, string> = {
  name: "#wine-name",
  producer: "#producer",
  vintage: "#vintage",
  wineType: 'input[name="wineType"]',
  country: "#country",
  region: "#region",
  subregion: "#subregion",
  appellation: "#appellation",
  alcoholPct: "#alcohol",
  grapes: '[id^="grape-pct-"]',
  tastedOn: "#tasted-on",
  price: "#price",
  currency: "#currency",
  servingTempC: "#temp",
  decantMinutes: "#decant",
};

/**
 * Brings the first invalid field into view and focuses it, opening any
 * collapsed section it sits in. Save buttons live in a sticky bar at the
 * bottom of long forms, so without this an error can render off screen.
 */
export function focusFirstError(errors: Record<string, unknown>) {
  for (const key of Object.keys(errors)) {
    const selector = ERROR_TARGETS[key];
    const el = selector ? document.querySelector<HTMLElement>(selector) : null;
    if (!el) continue;
    for (let d = el.closest("details"); d; d = d.parentElement?.closest("details") ?? null) d.open = true;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "center" });
    return;
  }
}
