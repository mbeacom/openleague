/**
 * Layout tokens shared by the session page and the session editor, hosted and
 * static (ADR-0020). Both shells set the two inset variables on an ancestor:
 * the height of their sticky top bar (where it covers the page) and of a fixed
 * bottom bar (the hosted phone navigation). Sticky columns and the editor's
 * save bar offset by them, so they never slide under either bar. Unset, both
 * read 0px.
 *
 * The two-column layouts respond to the width the page actually has, not the
 * viewport (a container query): hosted pages lose 260px to the dashboard
 * sidebar from md up, the static app loses nothing.
 */
/** The custom properties each shell sets (hosted: the planner layout; static: AppShell). */
export const PLANNER_INSET_VARS = {
    top: "--planner-top-inset",
    bottom: "--planner-bottom-inset",
} as const;

export const PLANNER_TOP_INSET = `var(${PLANNER_INSET_VARS.top}, 0px)`;
export const PLANNER_BOTTOM_INSET = `var(${PLANNER_INSET_VARS.bottom}, 0px)`;

/** Marks a box as the container the queries below measure. */
export const PLANNER_CONTAINER = { containerType: "inline-size" } as const;

/** Session page: the drill navigator beside the viewer once the page is this wide. */
export const SESSION_TWO_COLUMN = "@container (min-width: 760px)";
/** Session editor: the setup rail beside the drill list once the page is this wide. */
export const EDITOR_TWO_COLUMN = "@container (min-width: 1000px)";

/**
 * A column that stays in view below the top bar while the page scrolls, with
 * its own scroll when it is taller than the window. Grid items need
 * align-self: start, or they stretch and never stick.
 */
export const STICKY_COLUMN = {
    position: "sticky",
    top: `calc(${PLANNER_TOP_INSET} + 16px)`,
    alignSelf: "start",
    maxHeight: `calc(100vh - ${PLANNER_TOP_INSET} - 32px)`,
    overflowY: "auto",
    overscrollBehavior: "contain",
} as const;
