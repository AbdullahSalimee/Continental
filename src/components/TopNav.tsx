"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useCurrentUser, people, roles } from "@/lib/role-context";

const links = [
  { href: "/", label: "Overview" },
  { href: "/projects", label: "Registry" },
  { href: "/inbox", label: "Inbox" },
  { href: "/access", label: "Access" },
  { href: "/leadflow", label: "LeadFlow" },
];

export default function TopNav() {
  const pathname = usePathname();
  const { person, role, setPersonId } = useCurrentUser();

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="pulse-dot absolute inline-flex h-full w-full rounded-full bg-live" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight text-text">
            Continental <span className="text-text-muted font-normal">OS</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  active ? "text-text" : "text-text-muted hover:text-text"
                }`}
              >
                {l.label}
                {active && (
                  <motion.div
                    layoutId="nav-active"
                    className="absolute inset-0 -z-10 rounded-md bg-panel-2 border border-border-soft"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="text-xs text-text-faint">Viewing as</span>
            <span className="text-xs font-mono text-text-muted">{role.name}</span>
          </div>
          <select
            value={person.id}
            onChange={(e) => setPersonId(e.target.value)}
            className="rounded-md border border-border bg-panel px-2.5 py-1.5 text-sm text-text outline-none focus:border-live/50"
            aria-label="Switch demo user (stand-in for real auth)"
          >
            {people.map((p) => {
              const r = roles.find((r) => r.id === p.roleId)!;
              return (
                <option key={p.id} value={p.id}>
                  {p.name} — {r.name}
                </option>
              );
            })}
          </select>
        </div>
      </div>
    </header>
  );
}
