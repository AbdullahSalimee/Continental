import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createOAuthClient } from "@/lib/gmail";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const inboxAccountId = searchParams.get("state");

  if (!code || !inboxAccountId) {
    return NextResponse.redirect(`${origin}/inbox?gmail=missing_params`);
  }

  try {
    const client = createOAuthClient(`${origin}/api/gmail/callback`);
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      // Google only returns a refresh_token on first consent (or with prompt=consent).
      return NextResponse.redirect(`${origin}/inbox?gmail=no_refresh_token`);
    }

    await prisma.inboxAccount.update({
      where: { id: inboxAccountId },
      data: { googleRefreshToken: tokens.refresh_token }, // NOTE: encrypt at rest in production, not stored plaintext
    });

    return NextResponse.redirect(`${origin}/inbox?gmail=connected`);
  } catch (err) {
    return NextResponse.redirect(`${origin}/inbox?gmail=error`);
  }
}
