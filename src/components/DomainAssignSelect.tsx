"use client";

import { useState } from "react";
import type { Domain } from "@/lib/types";
import { updateProjectDomainAction } from "@/app/actions";

export default function DomainAssignSelect({
  projectId,
  currentDomainId,
  domains,
}: {
  projectId: string;
  currentDomainId: string;
  domains: Domain[];
}) {
  const [moving, setMoving] = useState(false);

  async function handleChange(domainId: string) {
    setMoving(true);
    try {
      await updateProjectDomainAction(projectId, domainId);
    } finally {
      setMoving(false);
    }
  }

  return (
    <select
      value={currentDomainId}
      disabled={moving}
      onChange={(e) => handleChange(e.target.value)}
      className="rounded-md border border-border bg-panel-2 px-2 py-1 text-xs text-text-muted outline-none focus:border-live/50 disabled:opacity-50"
    >
      {domains.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
