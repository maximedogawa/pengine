import * as Menubar from "@radix-ui/react-menubar";
import { Link } from "react-router-dom";

type TopMenuProps = {
  ctaLabel: string;
  ctaTo: string;
  ctaVariant?: "primary" | "secondary";
  showNavigationLinks?: boolean;
};

const menuItems = [
  { label: "How it works", href: "/#how" },
  { label: "Spec", href: "/#spec" },
  { label: "Roadmap", href: "/#roadmap" },
];

export function TopMenu({
  ctaLabel,
  ctaTo,
  ctaVariant = "secondary",
  showNavigationLinks = true,
}: TopMenuProps) {
  const ctaClass =
    ctaVariant === "primary"
      ? "primary-button rounded-xl px-4 py-2 text-xs"
      : "secondary-button rounded-xl px-4 py-2 text-xs text-slate-200";

  return (
    <header className="section-shell sticky top-0 z-40 pt-2 sm:pt-3">
      <div className="flex min-h-[3.25rem] items-center justify-between rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 sm:px-4 sm:py-2.5 backdrop-blur">
        <Link to="/" className="flex items-center gap-3">
          <img
            src="/pengine-logo-64.png"
            alt="Pengine logo"
            width={32}
            height={32}
            className="h-8 w-8 rounded-lg object-cover"
            decoding="async"
          />
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-(--mid)">
              Pengine
            </p>
            <p className="text-sm font-semibold text-white">Local AI Agent Engine</p>
          </div>
        </Link>

        {showNavigationLinks ? (
          <Menubar.Root className="hidden items-center gap-2 md:flex" aria-label="Main menu">
            {menuItems.map((item) => (
              <Menubar.Menu key={item.label}>
                <Menubar.Trigger asChild>
                  <a
                    href={item.href}
                    className="rounded-lg px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] text-(--mid) outline-none transition hover:text-slate-100 data-highlighted:bg-white/5 data-highlighted:text-slate-100"
                  >
                    {item.label}
                  </a>
                </Menubar.Trigger>
              </Menubar.Menu>
            ))}
          </Menubar.Root>
        ) : (
          <div className="hidden min-h-9 md:block" />
        )}

        <Link to={ctaTo} className={ctaClass}>
          {ctaLabel}
        </Link>
      </div>
    </header>
  );
}
