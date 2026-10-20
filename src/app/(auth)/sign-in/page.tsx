import type { Metadata } from "next";
import { Suspense } from "react";
import { emailConfigured } from "@/server/email";
import { AuthForm } from "../AuthForm";
import { Intro } from "../Intro";
import s from "../auth.module.css";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className={s.page}>
      <Intro />
      <Suspense>
        <AuthForm mode="sign-in" resetAvailable={emailConfigured()} />
      </Suspense>
    </div>
  );
}
