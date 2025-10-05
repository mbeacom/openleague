import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/config";

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);
