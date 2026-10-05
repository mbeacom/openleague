/**
 * Who may read a practice: its team's admins always, its members once it's
 * shared. The session detail read (page and bench sheet) and the export logo
 * action share this rule, so the logo is never readable by anyone the
 * practice isn't.
 */
export function canViewPracticeSession(role: string | null | undefined, isShared: boolean): boolean {
    if (!role) return false;
    return role === "ADMIN" || isShared;
}
