import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/session";
import { isSuperadmin } from "@/lib/rbac";
import { createOAuthClient, GMAIL_SCOPE } from "@/lib/gmail";

// GET /api/gmail/connect?inboxAccountId=xxx
// Redirects the founder to Google's consent screen for one specific inbox.
// Only superadmins can initiate this — connecting a new inbox is an
// access-granting action, same sensitivity class as anything else in Module D.
export async function GET(req: Request) {
  const { role } = await requireCurrentUser();
  if (!isSuperadmin(role)) {
    return NextResponse.json({ ok: false, message: "Only superadmins can connect a Gmail inbox." }, { status: 403 });
  }

  const { searchParams, origin } = new URL(req.url);
  const inboxAccountId = searchParams.get("inboxAccountId");
  if (!inboxAccountId) {
    return NextResponse.json({ ok: false, message: "Missing inboxAccountId." }, { status: 400 });
  }

  try {
    const redirectUri = `${origin}/api/gmail/callback`;
    const client = createOAuthClient(redirectUri);
    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent", // ensures a refresh_token is returned even on reconnect
      scope: [GMAIL_SCOPE],
      state: inboxAccountId,
    });
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json({ ok: false, message: (err as Error).message }, { status: 500 });
  }
}
