import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
    };
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
    sessionVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    /** Session-revocation counter, mirrored from User.sessionVersion. */
    sv?: number;
    /** Epoch ms of the last sessionVersion re-check (throttles the DB hit). */
    svCheckedAt?: number;
  }
}
