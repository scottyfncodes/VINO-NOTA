import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getSessionUser()) redirect("/");
  return <main id="main">{children}</main>;
}
