import { NextResponse } from "next/server";
import { inboxMessages } from "@/lib/store";

// Visibility/triage only, per the PRD: this toggles the system's own
// "handled" flag. It does not send, archive, or modify anything in the
// person's native Gmail account — a real build may optionally sync this
// back via the Gmail API (adding/removing a label), but that's additive,
// not required, since Module B is explicitly not a replacement email client.

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const msg = inboxMessages.find((m) => m.id === id);
  if (!msg) return NextResponse.json({ ok: false, message: "Message not found" }, { status: 404 });
  msg.handled = !msg.handled;
  return NextResponse.json({ ok: true, handled: msg.handled });
}
