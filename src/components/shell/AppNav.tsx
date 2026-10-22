"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Wordmark } from "./Wordmark";
import s from "./shell.module.css";

const ITEMS: { href: string; label: string; icon: IconName; capture?: boolean }[] = [
  { href: "/", label: "Atlas", icon: "atlas" },
  { href: "/journal", label: "Journal", icon: "journal" },
  { href: "/capture", label: "Record", icon: "capture", capture: true },
  { href: "/compendium", label: "Compendium", icon: "compendium" },
  { href: "/regions", label: "Regions", icon: "regions" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/journal") return pathname.startsWith("/journal") || pathname.startsWith("/wines") || pathname.startsWith("/tastings");
  return pathname.startsWith(href);
}

export function AppNav({ userName }: { userName: string }) {
  const pathname = usePathname();
  return (
    <>
      {/* Phones: a slim nameplate on inner pages (Atlas sets its own). Scrolls away with the page. */}
      {pathname !== "/" && (
        <header className={s.phoneBar}>
          <Link href="/" className={s.phoneBrand} aria-label="Vino Nota, Atlas">
            <Wordmark size="1.375rem" />
          </Link>
          <Link href="/settings" className={s.phoneAccount} aria-label="Account and settings" aria-current={pathname.startsWith("/settings") ? "page" : undefined}>
            <Icon name="user" size={20} />
          </Link>
        </header>
      )}
      <nav className={s.nav} aria-label="Primary">
        <div className={s.navInner}>
          <Link href="/" className={s.navBrand} aria-label="Vino Nota, Atlas">
            <Wordmark />
          </Link>
          <ul className={s.navList} role="list">
            {ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href} className={item.capture ? s.navCaptureSlot : undefined}>
                  <Link
                    href={item.href}
                    className={`${s.navItem} ${item.capture ? s.navItemCapture : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.capture ? (
                      <span className={s.capture}>
                        <Icon name={item.icon} size={22} />
                      </span>
                    ) : (
                      <Icon name={item.icon} size={22} className={s.navIcon} />
                    )}
                    <span className={s.label}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className={s.navFoot}>
            <Link href="/settings" className={s.navFootLink} aria-current={pathname.startsWith("/settings") ? "page" : undefined}>
              <Icon name="user" size={16} />
              <span className={s.navFootName}>{userName}</span>
              <span className={s.navFootSep} aria-hidden="true">·</span>
              Settings
            </Link>
          </div>
        </div>
      </nav>
    </>
  );
}
