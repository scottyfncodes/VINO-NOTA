import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { Suspense } from "react";
import { AuthForm } from "../AuthForm";
import { Intro } from "../Intro";
import s from "../auth.module.css";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage() {
  if (await getSessionUser()) redirect("/");
  return (
    <div className={s.page}>
      <Intro />
      <Suspense>
        <AuthForm mode="sign-up" />
      </Suspense>
    </div>
  );
}
