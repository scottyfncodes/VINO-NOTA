import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "../AuthForm";
import { Intro } from "../Intro";
import s from "../auth.module.css";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className={s.page}>
      <Intro />
      <Suspense>
        <AuthForm mode="sign-in" />
      </Suspense>
    </div>
  );
}
