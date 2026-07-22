import { google } from "googleapis";

// One Google Cloud OAuth app (client ID + secret) is enough to connect all
// ~10 Gmail inboxes — each inbox goes through its own consent flow and gets
// its own stored refresh token (see InboxAccount.googleRefreshToken), so a
// single app registration covers the whole account-sprawl problem.
export function createOAuthClient(redirectUri: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured.");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
