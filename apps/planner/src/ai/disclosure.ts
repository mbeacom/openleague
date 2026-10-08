/**
 * The AI disclosure (ADR-0023, spec R9). DRAFT WORDING, pending owner review
 * before release (spec open question 6).
 *
 * Owner ruling (2026-10-07): OpenLeague makes no statement about what a
 * provider does with a request: nothing about retention, training, logging,
 * privacy or compliance. The text describes only the mechanics the coach
 * controls, and points to the provider's own terms and privacy policy.
 */

export const AI_DISCLOSURE_TITLE = "Before you send";

/** One paragraph per entry. `{destination}` is replaced with the provider's name. */
export const AI_DISCLOSURE: readonly string[] = [
    "When you press Send, this page sends the request shown in the preview to {destination}, at the address you set up, with the key you entered (if any).",
    "What happens to the request after that is up to {destination}. Review its terms and privacy policy before you use it.",
    'Practice notes can include people\'s names, including players\' names. "Replace names" swaps only the names you list for placeholders such as "Player 1" before sending. It doesn\'t find names on its own, so check the preview.',
    "Nothing is sent until you press Send, and the draft that comes back is only saved if you choose Save.",
];

export const AI_DISCLOSURE_ACCEPT = "I understand";

export function disclosureText(destination: string): string[] {
    return AI_DISCLOSURE.map((paragraph) => paragraph.split("{destination}").join(destination));
}
