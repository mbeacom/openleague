import type { NextAuthConfig } from "next-auth";
import { CredentialsSignin } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { env, isProduction, isDevelopment } from "@/lib/env";
import { AUTH_ERROR_CODES } from "@/lib/config/constants";
import { revalidateSessionToken, seedSessionToken } from "@/lib/auth/session-version";
import { checkRateLimit, RATE_LIMITS } from "@/lib/utils/durable-rate-limit";

// Not yet in AUTH_ERROR_CODES (lib/config/constants.ts belongs to another
// workstream); the login page shows its generic "Unable to sign in" message
// for codes it does not recognize, which is acceptable for a throttle.
const RATE_LIMITED_ERROR_CODE = "rate_limited";

function throwCredentialsError(code: string): never {
  const err = new CredentialsSignin();
  err.code = code;
  throw err;
}

export const authOptions: NextAuthConfig = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throwCredentialsError(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
        }

        const email = credentials.email as string;
        const password = credentials.password as string;

        // Durable per-email attempt throttle before any DB lookup or bcrypt
        // work. The in-memory proxy limiter resets on every cold start, so
        // this is the only brute-force protection that survives serverless
        // scale-out. checkRateLimit fails open on DB errors, and rejection
        // goes through CredentialsSignin like every other authorize failure.
        const rl = await checkRateLimit(
          `login:email:${email.trim().toLowerCase()}`,
          RATE_LIMITS.LOGIN_PER_EMAIL
        );
        if (!rl.allowed) {
          throwCredentialsError(RATE_LIMITED_ERROR_CODE);
        }

        // Find user by email
        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          throwCredentialsError(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
        }

        // Verify password
        const isPasswordValid = await compare(password, user.passwordHash);

        if (!isPasswordValid) {
          throwCredentialsError(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
        }

        // approved is a moderation kill-switch (false = suspended)
        if (!user.approved) {
          throwCredentialsError(AUTH_ERROR_CODES.ACCOUNT_NOT_APPROVED);
        }

        // New accounts must prove inbox ownership before logging in
        if (!user.emailVerified) {
          throwCredentialsError(AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED);
        }

        // Return user object (will be stored in JWT). sessionVersion is
        // captured here and re-validated in the jwt callback so password
        // reset / change / email change can evict this session.
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  },
  cookies: {
    sessionToken: {
      name: `${isProduction ? "__Secure-" : ""}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction, // HTTPS only in production
      },
    },
    callbackUrl: {
      name: `${isProduction ? "__Secure-" : ""}next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction,
      },
    },
    csrfToken: {
      name: `${isProduction ? "__Host-" : ""}next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProduction,
      },
    },
  },
  pages: {
    signIn: "/login",
    signOut: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      // Sign-in / sign-up: seed identity + the session-version snapshot.
      if (user) {
        return seedSessionToken(token, user.id, user.sessionVersion ?? 0);
      }
      // Subsequent requests: throttled re-validation so a bumped
      // sessionVersion (password reset/change, email change) evicts the token.
      return revalidateSessionToken(token, { force: trigger === "update" });
    },
    async session({ session, token }) {
      // Add user ID to session from token
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  secret: env.NEXTAUTH_SECRET,
  // Enable CSRF protection (enabled by default, but explicit for clarity)
  useSecureCookies: isProduction,
  trustHost: true,
  basePath: "/api/auth",
  debug: isDevelopment,
};
