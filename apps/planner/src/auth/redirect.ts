/**
 * The only script auth/redirect.html runs (storage connectors spec R6): MSAL's
 * redirect bridge, which passes the sign-in response in this page's URL to the
 * planner window that opened the popup or the hidden iframe. Nothing is logged
 * but the error's name: the URL carries an authorization code.
 */
import { broadcastResponseToMainFrame } from "@azure/msal-browser/redirect-bridge";

broadcastResponseToMainFrame().catch((error: unknown) => {
    console.error("Sign-in response not delivered:", error instanceof Error ? error.name : "unknown");
});
