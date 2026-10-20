import type { Metadata } from "next";
import { emailConfigured } from "@/server/email";
import { Intro } from "../Intro";
import { ForgotPasswordForm } from "../PasswordResetForms";
import s from "../auth.module.css";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className={s.page}>
      <Intro />
      <ForgotPasswordForm available={emailConfigured()} />
    </div>
  );
}
