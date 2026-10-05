/** The editor's Staff section (practice staff, spec R3, R4, R8). */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { drill, renderEditor, save, stubResizeObserver } from "@/__tests__/helpers/session-editor";
import { STAFF_NAME_TAKEN_MESSAGE } from "@/lib/utils/session-staff";
import { MAX_SESSION_STAFF, type SessionItem, type SessionStaffMember, type StaffOption } from "@/types/practice-planner";

beforeAll(stubResizeObserver);

const LEE: SessionStaffMember = { id: "st1", name: "Coach Lee", teamOfficialId: "coff1", userId: null };
const SAM: SessionStaffMember = { id: "st2", name: "Sam", teamOfficialId: null, userId: null };
/** As getPracticeSessionForEdit returns it: every row carries its staff keys. */
const STAFFED: SessionItem[] = [
    drill("k1", 0, { staff: ["st2"] }),
    { id: "kw", kind: "warmup", label: "", sequence: 1, duration: 8, instructions: "", runsWithPrevious: false, staff: ["st2", "st1"] },
    drill("k2", 2, { staff: [] }),
];
const OPTIONS: StaffOption[] = [
    { kind: "official", id: "coff1", name: "Coach Lee", roleLabel: "Head Coach" },
    { kind: "official", id: "coff2", name: "Pat Park", roleLabel: "Assistant Coach" },
    // An email the option must never show or send (a stray field, as a careless query could add one).
    { kind: "admin", id: "cuser3", name: "Alex Admin", roleLabel: "Team admin", email: "alex@example.com" } as StaffOption,
];

const sent = (onSave: { mock: { calls: unknown[][] } }) => onSave.mock.calls[0][0] as { staff?: SessionStaffMember[]; plays: SessionItem[] };
/** Opens Add staff and returns the live menu (findByRole retries while a closing menu is still mounted). */
const openAddStaff = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Add staff" }));
    return screen.findByRole("menu");
};
const itemTexts = (menu: HTMLElement) => within(menu).getAllByRole("menuitem").map((item) => item.textContent);

describe("PracticeSessionEditor: the Staff section", () => {
    it("offers only Type a name without picker options (the static planner), and saves the typed name", async () => {
        const onSave = renderEditor([drill("k1", 0)]);
        expect(screen.getByText("No staff yet. Add a coach or a volunteer to show who runs each part.")).toBeInTheDocument();
        const menu = await openAddStaff();
        expect(itemTexts(menu)).toEqual(["Type a name"]);
        fireEvent.click(within(menu).getByRole("menuitem", { name: "Type a name" }));
        fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "  Sam  " } });
        await save();
        expect(sent(onSave).staff).toEqual([{ id: expect.any(String), name: "  Sam  " }]);
    });

    it("saves without a typed person whose name is still empty (Review Focus 5)", async () => {
        const onSave = renderEditor([drill("k1", 0)]);
        fireEvent.click(within(await openAddStaff()).getByRole("menuitem", { name: "Type a name" }));
        expect(screen.getByText("Not saved until it has a name")).toBeInTheDocument();
        await save();
        expect(sent(onSave).staff).toEqual([]);
    });

    it("lists the team's officials and admins by name and role (no email), links the pick, and offers it only once", async () => {
        const onSave = renderEditor([drill("k1", 0)], {}, undefined, { staffOptions: OPTIONS });
        const menu = await openAddStaff();
        expect(itemTexts(menu)).toEqual(["Coach LeeHead Coach", "Pat ParkAssistant Coach", "Alex AdminTeam admin", "Type a name"]);
        expect(document.body.textContent).not.toContain("@");
        fireEvent.click(within(menu).getByRole("menuitem", { name: /Pat Park/ }));
        const list = screen.getByRole("list", { name: "Staff" });
        expect(within(list).getByText("Pat Park")).toBeInTheDocument();
        expect(within(list).getByText("Team official")).toBeInTheDocument();
        expect(within(list).queryByRole("textbox")).toBeNull();
        const again = await openAddStaff();
        expect(itemTexts(again)).not.toContain("Pat ParkAssistant Coach");
        fireEvent.click(within(again).getByRole("menuitem", { name: /Alex Admin/ }));
        expect(within(list).getByText("Team admin")).toBeInTheDocument();
        await save();
        expect(sent(onSave).staff).toEqual([
            { id: expect.any(String), name: "Pat Park", teamOfficialId: "coff2" },
            { id: expect.any(String), name: "Alex Admin", userId: "cuser3" },
        ]);
    });

    it("saves an untouched list and every row's staff back unchanged (Review Focus 1)", async () => {
        const onSave = renderEditor(STAFFED, { staff: [LEE, SAM] });
        fireEvent.change(screen.getByLabelText(/^Session Title/), { target: { value: "Renamed" } });
        await save();
        expect(sent(onSave).staff).toEqual([LEE, SAM]);
        expect(sent(onSave).plays).toEqual(STAFFED);
    });

    it("sends no staff when the editor never held a list, even after opening Add staff (absent = unchanged)", async () => {
        const onSave = renderEditor([drill("k1", 0)]);
        // Fails before the section exists (no Add staff), and opening the menu must not start a list.
        const menu = await openAddStaff();
        fireEvent.keyDown(menu, { key: "Escape" });
        await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
        await save();
        expect(sent(onSave).staff).toBeUndefined();
    });

    it("swaps a new person's key for the id the save returns, on the list and the rows, without remounting their Name field", async () => {
        // As EditSessionWrapper returns a hosted save: every sent key with its stored id (a stored id maps to itself).
        const onSave = vi.fn().mockImplementation(async (session: { staff?: SessionStaffMember[] }) => ({
            success: true,
            staff: (session.staff ?? []).map((member) => ({ key: member.id, id: member.id.startsWith("k-") ? `cstored-${member.id}` : member.id })),
        }));
        // Pat was added in this sitting: the editor still holds their key, on the list and on a row.
        renderEditor([drill("k1", 0, { staff: ["k-new", "st2"] })], { staff: [SAM, { id: "k-new", name: "Pat" }] }, onSave);
        const field = screen.getAllByRole("textbox", { name: "Name" })[1];
        field.focus();
        await save();
        // The same element, still focused: the row kept its React key when its id changed.
        expect(screen.getAllByRole("textbox", { name: "Name" })[1]).toBe(field);
        expect(field).toHaveFocus();
        fireEvent.change(field, { target: { value: "Pat Park" } });
        await save();
        const second = onSave.mock.calls[1][0] as { staff?: SessionStaffMember[]; plays: SessionItem[] };
        expect(second.staff).toEqual([SAM, { id: "cstored-k-new", name: "Pat Park" }]);
        expect(second.plays[0].staff).toEqual(["cstored-k-new", "st2"]);
    });

    it("removes someone who runs nothing at once, and asks before removing someone who runs rows (Review Focus 4)", async () => {
        const onSave = renderEditor(STAFFED, { staff: [LEE, SAM, { id: "st3", name: "Idle" }] });
        fireEvent.click(screen.getByRole("button", { name: "Remove Idle" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.queryByRole("button", { name: "Remove Idle" })).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Remove Sam" }));
        const dialog = await screen.findByRole("dialog", { name: "Remove staff member" });
        expect(dialog).toHaveTextContent("Remove Sam? They run 2 rows.");
        fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
        // MUI's Dialog closes after its exit transition and keeps the page aria-hidden until then,
        // so a role query right after Cancel or Remove would miss (as in PlayLibrary.test.tsx).
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(screen.getByRole("button", { name: "Remove Sam" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Remove Sam" }));
        fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await save();
        expect(sent(onSave).staff?.map((member) => member.name)).toEqual(["Coach Lee"]);
        expect(sent(onSave).plays.map((row) => row.staff)).toEqual([[], ["st1"], []]);
    });

    it("says when a typed name clashes with another person's, ignoring case", async () => {
        renderEditor([drill("k1", 0)], { staff: [SAM] });
        fireEvent.click(within(await openAddStaff()).getByRole("menuitem", { name: "Type a name" }));
        fireEvent.change(screen.getAllByRole("textbox", { name: "Name" })[1], { target: { value: "SAM" } });
        expect(screen.getAllByText(STAFF_NAME_TAKEN_MESSAGE)).toHaveLength(2);
    });

    it("stops adding at 12 people", () => {
        renderEditor([drill("k1", 0)], { staff: Array.from({ length: MAX_SESSION_STAFF }, (_, i) => ({ id: `s${i}`, name: `Coach ${i}` })) });
        expect(screen.getByRole("button", { name: "Add staff" })).toBeDisabled();
    });
});

describe("PracticeSessionEditor: Run by on the row cards", () => {
    it("shows Run by on every drill and block card once someone is named, and saves the picks in order", async () => {
        const onSave = renderEditor(STAFFED, { staff: [LEE, SAM] });
        expect(screen.getAllByRole("combobox", { name: /^Run by for / }).map((field) => field.getAttribute("aria-label"))).toEqual([
            "Run by for Drill k1", "Run by for Warm-up", "Run by for Drill k2",
        ]);
        const k2 = screen.getByRole("combobox", { name: "Run by for Drill k2" });
        fireEvent.keyDown(k2, { key: "ArrowDown" });
        fireEvent.click(screen.getByRole("option", { name: "Sam" }));
        fireEvent.click(screen.getByRole("option", { name: "Coach Lee" }));
        await save();
        expect(sent(onSave).plays.map((row) => row.staff)).toEqual([["st2"], ["st2", "st1"], ["st2", "st1"]]);
    });

    it("keeps an open drill edit when Run by changes on another row", () => {
        renderEditor(STAFFED, { staff: [LEE, SAM] });
        fireEvent.click(screen.getByRole("button", { name: "Edit play 1" }));
        fireEvent.change(screen.getByRole("textbox", { name: "Instructions" }), { target: { value: "Half speed" } });
        fireEvent.keyDown(screen.getByRole("combobox", { name: "Run by for Drill k2" }), { key: "ArrowDown" });
        fireEvent.click(screen.getByRole("option", { name: "Sam" }));
        expect(screen.getByRole("textbox", { name: "Instructions" })).toHaveValue("Half speed");
    });

    it("hides Run by while nobody on the list has a name", () => {
        renderEditor([drill("k1", 0)], { staff: [{ id: "st9", name: "" }] });
        expect(screen.queryByRole("combobox", { name: /^Run by for / })).toBeNull();
    });

    it("drops a removed person's chips from the cards at once", async () => {
        renderEditor(STAFFED, { staff: [LEE, SAM] });
        expect(screen.getAllByText("Sam").length).toBeGreaterThan(1);
        fireEvent.click(screen.getByRole("button", { name: "Remove Sam" }));
        fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }));
        expect(screen.queryByText("Sam")).toBeNull();
    });
});
