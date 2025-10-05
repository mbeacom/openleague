import { auth } from "@/auth";
import { redirect } from "next/navigation";

/**
 * Get the current user session
 * Returns null if user is not authenticated
 */
export async function getSession() {
  return await auth();
}

/**
 * Require authentication for a route
 * Redirects to login page if user is not authenticated
 * Returns the session if user is authenticated
 */
export async function requireAuth() {
  const session = await getSession();

  if (!session || !session.user) {
    redirect("/login");
  }

  return session;
}

/**
 * Get the current user ID
 * Returns null if user is not authenticated
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}

/**
 * Require user ID for a route
 * Redirects to login page if user is not authenticated
 * Returns the user ID if user is authenticated
 */
export async function requireUserId(): Promise<string> {
  const session = await requireAuth();
  return session.user.id;
}
