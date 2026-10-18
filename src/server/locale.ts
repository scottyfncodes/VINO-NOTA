import "server-only";
import { headers } from "next/headers";

/** Best-effort display locale from the browser's Accept-Language header. */
export async function getRequestLocale(): Promise<string> {
  const header = (await headers()).get("accept-language") ?? "";
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim();
    if (!tag || tag === "*") continue;
    try {
      if (Intl.DateTimeFormat.supportedLocalesOf([tag]).length) return tag;
    } catch {
      // ignore malformed tags
    }
  }
  return "en-US";
}
