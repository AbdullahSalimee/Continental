"use server";

import { signIn, signOut } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect(`/login?error=1`);
    }
    throw err;
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function updateProjectBranchAction(
  projectId: string,
  branchId: string,
) {
  await requireCurrentUser(); // any signed-in user may re-assign; tighten to superadmin-only if needed
  await prisma.project.update({ where: { id: projectId }, data: { branchId } });
  // Keep sync history honest: a manual move should show up as the latest assigned branch too.
  await prisma.syncStamp.updateMany({
    where: { projectId },
    data: { assignedBranchId: branchId },
  });
  revalidatePath("/"); // adjust if the registry lives at a different route
}
