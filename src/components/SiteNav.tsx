"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export default function SiteNav() {
  const pathname = usePathname();
  const [hide, setHide] = React.useState(false);

  React.useEffect(() => {
    const compute = () => {
      try {
        const mode = document?.body?.dataset?.kioskMode;
        setHide(mode === 'writing');
      } catch {}
    };
    compute();
    const onChange = () => compute();
    window.addEventListener('kioskmodechange', onChange);
    return () => window.removeEventListener('kioskmodechange', onChange);
  }, []);

  if (hide) return null;
  const tabs = [
    { href: "/", label: "Scoring" },
    { href: "/kiosk", label: "Kiosk" },
  ];

  return (
    <div className="w-full bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-slate-200 sticky top-0 z-40">
      <div className="mx-auto w-full max-w-screen-xl 2xl:max-w-screen-2xl px-4 md:px-8 py-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-700">CBM Writing & Spelling</div>
        <nav className="flex items-center gap-2">
          {tabs.map((t) => {
            const active = pathname === t.href || (t.href !== "/" && pathname?.startsWith(t.href));
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-slate-900 text-white shadow"
                    : "text-slate-700 hover:bg-slate-100"
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
