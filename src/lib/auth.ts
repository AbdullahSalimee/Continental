import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────────────────────────────────
// This replaces the earlier client-side role-switcher. Sessions are now
// real, signed JWTs issued only after a password check against the
// database — nobody can pick "superadmin" from a dropdown anymore.
//
// Why Credentials (not Google OAuth) for app sign-in: Continental's own
// sign-in doesn't need to depend on a Google Cloud OAuth app that doesn't
// exist yet. Google OAuth is used separately and specifically for
// connecting individual Gmail inboxes for polling (see /api/gmail/*),
// which is a different concern (per-inbox data access, not app identity).
// If you'd rather standardize on Google Workspace SSO for sign-in too,
// swap/add a Google provider here — the session callbacks below already
// attach personId/role generically.
// ─────────────────────────────────────────────────────────────────────────

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const person = await prisma.person.findUnique({
          where: { email },
          include: { role: true },
        });
        if (!person || !person.active) return null;

        const valid = await bcrypt.compare(password, person.passwordHash);
        if (!valid) return null;

        return {
          id: person.id,
          name: person.name,
          email: person.email,
          roleId: person.roleId,
          roleName: person.role.name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.personId = (user as any).id;
        token.roleId = (user as any).roleId;
        token.roleName = (user as any).roleName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.personId;
        (session.user as any).roleId = token.roleId;
        (session.user as any).roleName = token.roleName;
      }
      return session;
    },
  },
});
