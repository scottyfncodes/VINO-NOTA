import type { Metadata } from "next";
import { Intro } from "../Intro";
import { ResetPasswordForm } from "../PasswordResetForms";
import s from "../auth.module.css";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const sp = await searchParams;
  // Better Auth redirects here with ?token=… for a valid link, or ?error=INVALID_TOKEN.
  const token = typeof sp.token === "string" && !sp.error ? sp.token : null;
  return (
    <div className={s.page}>
      <Intro />
      <ResetPasswordForm token={token} />
    </div>
  );
}
