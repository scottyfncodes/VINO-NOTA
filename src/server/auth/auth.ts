import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { after } from "next/server";
import { getDb } from "@/server/db";
import { account, rateLimit, session, user, verification } from "@/server/db/schema";
import { emailConfigured, sendEmail } from "@/server/email";
import { passwordResetEmail, RESET_TOKEN_TTL_SECONDS } from "./emails";

/**
 * Lets Better Auth send mail after the response, so a reset request takes the
 * same time whether or not the account exists. Outside a request (tests,
 * scripts) the task simply runs on its own.
 */
function runAfterResponse(task: Promise<unknown>) {
  try {
    after(() => task);
  } catch {
    void task;
  }
}

function trustedOrigins(): string[] {
  const origins = new Set<string>();
  const add = (host?: string) => host && origins.add(host.startsWith("http") ? host : `https://${host}`);
  add(process.env.BETTER_AUTH_URL);
  add(process.env.VERCEL_URL);
  add(process.env.VERCEL_BRANCH_URL);
  add(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  return [...origins];
}

function baseURL(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return undefined;
}

function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET is not configured.");
  }
  return betterAuth({
    appName: "Vino Nota",
    baseURL: baseURL(),
    secret,
    trustedOrigins: trustedOrigins(),
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user, session, account, verification, rateLimit },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: true,
      resetPasswordTokenExpiresIn: RESET_TOKEN_TTL_SECONDS,
      revokeSessionsOnPasswordReset: true,
      // Without an email provider, reset stays off and the UI says so.
      ...(emailConfigured() && {
        sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
          await sendEmail(passwordResetEmail(user.email, url));
        },
      }),
    },
    advanced: { backgroundTasks: { handler: runAfterResponse } },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      // AUTH_RATE_LIMIT=off exists only for automated end-to-end test servers.
      enabled: process.env.NODE_ENV === "production" && process.env.AUTH_RATE_LIMIT !== "off",
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 6 },
        "/sign-up/email": { window: 3600, max: 10 },
        "/request-password-reset": { window: 3600, max: 5 },
        "/reset-password": { window: 60, max: 10 },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const globalForAuth = globalThis as unknown as { __vinoAuth?: Auth };

export function getAuth(): Auth {
  globalForAuth.__vinoAuth ??= createAuth();
  return globalForAuth.__vinoAuth;
}
