"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import type { InboxAccount, InboxMessage, Project } from "@/lib/types";
import { timeAgo } from "@/lib/format";

export default function InboxClient({
  messages,
  accounts,
  projects,
}: {
  messages: InboxMessage[];
  accounts: InboxAccount[];
  projects: Project[];
}) {
  const [items, setItems] = useState(messages);
  const [showHandled, setShowHandled] = useState(false);

  async function toggle(id: string) {
    setItems((prev) => prev.map((m) => (m.id === id ? { ...m, handled: !m.handled } : m)));
    await fetch(`/api/inbox/${id}/handle`, { method: "POST" }).catch(() => {});
  }

  const visible = items.filter((m) => showHandled || !m.handled);
  const unhandledCount = items.filter((m) => !m.handled).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="rounded-full border border-signal/30 bg-signal/10 px-3 py-1 text-xs font-mono text-signal">
          {unhandledCount} unhandled
        </span>
        <button
          onClick={() => setShowHandled((v) => !v)}
          className="text-xs text-text-faint hover:text-text-muted"
        >
          {showHandled ? "Hide handled" : "Show handled"}
        </button>
      </div>

      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {visible.map((m) => {
            const account = accounts.find((a) => a.id === m.accountId);
            const project = projects.find((p) => p.id === m.inferredProjectId);
            return (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, height: 0 }}
                className={`rounded-lg border px-4 py-3 ${
                  m.handled ? "border-border-soft bg-panel/40 opacity-60" : "border-border bg-panel"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[11px] font-mono text-text-faint">
                      <span>{account?.label}</span>
                      <span>·</span>
                      <span>{timeAgo(m.receivedAt)}</span>
                      {project && (
                        <>
                          <span>·</span>
                          <Link href={`/projects/${project.id}`} className="text-info hover:underline">{project.name}</Link>
                        </>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-text">{m.subject}</p>
                    <p className="mt-0.5 truncate text-xs text-text-muted">{m.from} — {m.snippet}</p>
                  </div>
                  <button
                    onClick={() => toggle(m.id)}
                    className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-mono transition-colors ${
                      m.handled
                        ? "border-border text-text-faint hover:text-text-muted"
                        : "border-live/30 bg-live/10 text-live hover:bg-live/20"
                    }`}
                  >
                    {m.handled ? "reopen" : "mark handled"}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {visible.length === 0 && <p className="text-xs text-text-faint">Nothing here — inbox is clear.</p>}
      </div>
    </div>
  );
}
