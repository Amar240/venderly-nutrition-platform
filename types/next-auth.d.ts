import type { AppSession } from "@/server/auth/types";

declare module "next-auth" {
  interface Session {
    appSession?: AppSession;
  }
  interface User {
    appSession?: AppSession;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    appSession?: AppSession;
  }
}
