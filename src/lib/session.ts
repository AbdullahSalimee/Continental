import { redirect } from "next/navigation";
import { auth } from "./auth";
import { getPersonById, getPersonRoleById } from "./store";

export async function requireCurrentUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const personId = (session.user as any).id as string;
  const person = await getPersonById(personId);
  if (!person) redirect("/login");

  const role = await getPersonRoleById(person.roleId);
  return { person, role };
}

// For API routes: never redirects (that's meaningless for a fetch() call).
// Returns null when unauthenticated so the caller can respond with 401 JSON.
export async function getSessionUserOrNull() {
  const session = await auth();
  if (!session?.user) return null;
  const personId = (session.user as any).id as string;
  const person = await getPersonById(personId);
  if (!person) return null;
  const role = await getPersonRoleById(person.roleId);
  return { person, role };
}
