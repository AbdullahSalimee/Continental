import { getSessionUserOrNull } from "./session";
import { isSuperadmin } from "./rbac";

// Satisfies the PRD's "both scheduled and on-demand" sync requirement:
// on-demand calls come from a signed-in superadmin clicking "sync" in the
// Registry UI; scheduled calls come from a cron trigger (see vercel.json)
// presenting CRON_SECRET as a bearer token instead of a session cookie.
export async function authorizeSyncRequest(req: Request): Promise<{ ok: true; actor: string } | { ok: false; status: number; message: string }> {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { ok: true, actor: "scheduled-cron" };
  }

  const user = await getSessionUserOrNull();
  if (user && isSuperadmin(user.role)) {
    return { ok: true, actor: user.person.name };
  }

  return { ok: false, status: 401, message: "Sync must be triggered by a superadmin session or a valid CRON_SECRET." };
}
