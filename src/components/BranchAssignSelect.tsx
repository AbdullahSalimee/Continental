"use client";

import { useState } from "react";
import type { Branch } from "@/lib/types";
import { updateProjectBranchAction } from "@/app/actions";

export default function BranchAssignSelect({
  projectId,
  currentBranchId,
  branches,
}: {
  projectId: string;
  currentBranchId: string;
  branches: Branch[];
}) {
  const [moving, setMoving] = useState(false);

  async function handleChange(branchId: string) {
    setMoving(true);
    try {
      await updateProjectBranchAction(projectId, branchId);
    } finally {
      setMoving(false);
    }
  }

  return (
    <select
      value={currentBranchId}
      disabled={moving}
      onChange={(e) => handleChange(e.target.value)}
      className="rounded-md border border-border bg-panel-2 px-2 py-1 text-xs text-text-muted outline-none focus:border-live/50 disabled:opacity-50"
    >
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
