"use server";

import { signOut } from "@/auth";

/**
 * Logout action - terminates session and redirects to login
 * Requirement 1.7: Terminate session and redirect on logout
 */
export async function logout() {
  await signOut({ redirectTo: "/login" });
}
