import { NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { authorizeSyncRequest } from "@/lib/cron-auth";
import { createOAuthClient } from "@/lib/gmail";

// Polls every InboxAccount that has completed the /api/gmail/connect flow.
// Real, working code — it just needs GOOGLE_CLIENT_ID/SECRET (your own
// Google Cloud OAuth app) and at least one inbox to have gone through
// /api/gmail/connect before this does anything.
export async function POST(req: Request) {
  const auth = await authorizeSyncRequest(req);
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  const { origin } = new URL(req.url);
  const accounts = await prisma.inboxAccount.findMany({ where: { googleRefreshToken: { not: null } } });

  if (accounts.length === 0) {
    return NextResponse.json({
      ok: true,
      configured: false,
      message: "No inboxes have completed Gmail OAuth yet. Connect one from the Inbox page first.",
    });
  }

  let totalNew = 0;
  const errors: string[] = [];

  for (const account of accounts) {
    try {
      const client = createOAuthClient(`${origin}/api/gmail/callback`);
      client.setCredentials({ refresh_token: account.googleRefreshToken! });
      const gmail = google.gmail({ version: "v1", auth: client });

      const list = await gmail.users.messages.list({ userId: "me", maxResults: 20, q: "newer_than:7d" });
      for (const m of list.data.messages ?? []) {
        if (!m.id) continue;
        const exists = await prisma.inboxMessage.findUnique({ where: { gmailMessageId: m.id } });
        if (exists) continue;

        const full = await gmail.users.messages.get({ userId: "me", id: m.id, format: "metadata", metadataHeaders: ["From", "Subject", "Date"] });
        const headers = full.data.payload?.headers ?? [];
        const from = headers.find((h) => h.name === "From")?.value ?? "unknown";
        const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
        const dateHeader = headers.find((h) => h.name === "Date")?.value;

        await prisma.inboxMessage.create({
          data: {
            accountId: account.id,
            from,
            subject,
            snippet: full.data.snippet ?? "",
            receivedAt: dateHeader ? new Date(dateHeader) : new Date(),
            handled: false,
            gmailMessageId: m.id,
          },
        });
        totalNew++;
      }
      await prisma.inboxAccount.update({ where: { id: account.id }, data: { lastPolledAt: new Date() } });
    } catch (err) {
      errors.push(`${account.label}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    configured: true,
    message: `Pulled ${totalNew} new message(s) across ${accounts.length} connected inbox(es)${errors.length ? `. Errors: ${errors.join("; ")}` : ""} (triggered by ${auth.actor}).`,
  });
}
