"use server";

import { signIn, signOut } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

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
