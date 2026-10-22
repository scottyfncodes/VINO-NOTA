import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { Suspense } from "react";
import { emailConfigured } from "@/server/email";
import { AuthForm } from "../AuthForm";
import { Intro } from "../Intro";
import s from "../auth.module.css";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getSessionUser()) redirect("/");
  return (
    <div className={s.page}>
      <Intro />
      <Suspense>
        <AuthForm mode="sign-in" resetAvailable={emailConfigured()} />
      </Suspense>
    </div>
  );
}
