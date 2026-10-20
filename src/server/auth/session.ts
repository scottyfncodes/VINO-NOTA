import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./auth";

export type SessionUser = { id: string; name: string; email: string; emailVerified: boolean };

/** Reads and validates the session server-side. Cached for the duration of a request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const result = await getAuth().api.getSession({ headers: await headers() });
  if (!result?.user) return null;
  return { id: result.user.id, name: result.user.name, email: result.user.email, emailVerified: result.user.emailVerified };
});

/** For pages and server actions: redirects to sign-in when there is no valid session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}
