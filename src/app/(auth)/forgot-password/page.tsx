import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { emailConfigured } from "@/server/email";
import { Intro } from "../Intro";
import { ForgotPasswordForm } from "../PasswordResetForms";
import s from "../auth.module.css";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage() {
  if (await getSessionUser()) redirect("/");
  return (
    <div className={s.page}>
      <Intro />
      <ForgotPasswordForm available={emailConfigured()} />
    </div>
  );
}
