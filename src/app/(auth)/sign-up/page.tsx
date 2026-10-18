import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "../AuthForm";
import { Intro } from "../Intro";
import s from "../auth.module.css";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <div className={s.page}>
      <Intro />
      <Suspense>
        <AuthForm mode="sign-up" />
      </Suspense>
    </div>
  );
}
