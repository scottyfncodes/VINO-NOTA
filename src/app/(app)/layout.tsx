import { AppNav } from "@/components/shell/AppNav";
import { shellStyles as s } from "@/components/shell/PageHeader";
import { requireUser } from "@/server/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className={s.frame}>
      <AppNav userName={user.name} />
      <main id="main" className={s.main} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
