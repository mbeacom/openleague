/**
 * An "Open in OpenLeague" link (#plan=…) that hits the auth redirect lands on
 * /login with its fragment (Ruling 2). The login page keeps the plan and sends
 * the coach to the import page after sign-in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: nav.push, refresh: nav.refresh }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn().mockResolvedValue({ ok: true, error: undefined, status: 200, url: null }) }));
vi.mock("@/lib/actions/account-lifecycle", () => ({ resendVerificationEmail: vi.fn() }));

import LoginPage from "@/app/(auth)/login/page";
import { PENDING_PLAN_KEY, PLAN_IMPORT_PATH } from "@/lib/plan-document/pending";

function logIn() {
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "coach@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: "correct-horse-battery" } });
    fireEvent.click(screen.getByRole("button", { name: "Log In" }));
}

beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    window.history.replaceState(null, "", "/login");
});

describe("login with a pending plan", () => {
    it("stashes a #plan= fragment, clears it, and goes to the import page after sign-in", async () => {
        window.history.replaceState(null, "", "/login#plan=abc123");
        render(<LoginPage />);

        await waitFor(() => expect(window.location.hash).toBe(""));
        expect(JSON.parse(sessionStorage.getItem(PENDING_PLAN_KEY) ?? "null")).toMatchObject({ value: "abc123" });

        logIn();
        await waitFor(() => expect(nav.push).toHaveBeenCalledWith(PLAN_IMPORT_PATH));
    });

    it("goes to the callback as before when there is no plan", async () => {
        render(<LoginPage />);
        logIn();
        await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/"));
    });

    it("ignores a stale stash from an abandoned visit", async () => {
        sessionStorage.setItem(PENDING_PLAN_KEY, JSON.stringify({ value: "old", savedAt: Date.now() - 31 * 60_000 }));
        render(<LoginPage />);
        logIn();
        await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/"));
    });
});
