import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authenticate } from "@/server/auth/authenticate";
import type { AppSession } from "@/server/auth/types";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/signin" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totp: { label: "Authenticator code", type: "text" },
      },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const ip =
          request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          request?.headers?.get("x-real-ip") ||
          "unknown";

        const result = await authenticate({ ...parsed.data, ip });
        if (!result.ok) return null;

        // Stash the AppSession on the user object; the jwt callback moves it
        // into the token, the session callback exposes it to the app.
        const id =
          result.session.principalType === "staff"
            ? result.session.userId
            : result.session.guardianId;
        return { id, appSession: result.session };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user && "appSession" in user) {
        (token as { appSession?: AppSession }).appSession = (
          user as { appSession: AppSession }
        ).appSession;
      }
      return token;
    },
    session({ session, token }) {
      const appSession = (token as { appSession?: AppSession }).appSession;
      if (appSession) {
        session.appSession = appSession;
      }
      return session;
    },
  },
});
