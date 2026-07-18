import type { NextAuthConfig } from "next-auth";
import { CredentialsSignin } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { env, isProduction, isDevelopment } from "@/lib/env";
import { AUTH_ERROR_CODES } from "@/lib/config/constants";

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

        // Return user object (will be stored in JWT)
        return {
          id: user.id,
          email: user.email,
          name: user.name,
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
    async jwt({ token, user }) {
      // Add user ID to token on sign in
      if (user) {
        token.id = user.id;
      }
      return token;
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
