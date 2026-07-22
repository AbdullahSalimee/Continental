import { NextResponse } from "next/server";
import { toggleInboxMessageHandled } from "@/lib/store";
import { getSessionUserOrNull } from "@/lib/session";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUserOrNull();
  if (!user) return NextResponse.json({ ok: false, message: "Not authenticated" }, { status: 401 });
  const { id } = await params;
  const updated = await toggleInboxMessageHandled(id);
  if (!updated) return NextResponse.json({ ok: false, message: "Message not found" }, { status: 404 });
  return NextResponse.json({ ok: true, handled: updated.handled });
}
