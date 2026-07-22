import { inboxMessages, inboxAccounts, projects } from "@/lib/store";
import InboxClient from "@/components/InboxClient";

export default function InboxPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-text-faint">Module B</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">Unified Inbox</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          A triage layer over {inboxAccounts.length} connected inboxes — visibility, not a replacement for Gmail. Reply from the native account; mark handled here.
        </p>
      </div>
      <InboxClient messages={inboxMessages} accounts={inboxAccounts} projects={projects} />
    </div>
  );
}
