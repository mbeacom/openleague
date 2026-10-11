"use client";

/**
 * Drag and drop for the session editor's list: a whole unit (a standalone
 * drill, a warm-up or break, or a station block) moves among the units, and a
 * station moves within its own block. The up / down arrows stay as the
 * accessible fallback; both end in the same timeline rules (moveUnitTo,
 * moveStationTo in session-timeline).
 *
 * The list stays flat (a station block's header and its cards are siblings,
 * never a wrapper) so a drill joining, leaving or heading a block never
 * remounts its card. So there is one SortableContext over every element, and
 * a unit-aware strategy instead of nested contexts: while a unit is dragged
 * only unit leaders (a standalone card, a block's header) are drop targets and
 * a block's cards ride along with its header; while a station is dragged only
 * the stations of its block are. A block header measures as its whole block.
 */
import { createContext, useContext, useId, useMemo, useState, type ReactNode } from "react";
import { Box, IconButton, Paper, Stack, Typography } from "@mui/material";
import { DragIndicator as DragIndicatorIcon } from "@mui/icons-material";
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    closestCenter,
    getClientRect,
    useSensor,
    useSensors,
    type Announcements,
    type ClientRect,
    type CollisionDetection,
    type DragEndEvent,
    type DragStartEvent,
    type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, type SortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** One element of the flat list: a unit's leader, or a station of a block (whose leader is the block header). */
export type SortElement =
    | { kind: "unit"; unit: number; rowIndex: number; name: string }
    | { kind: "station"; unit: number; rowIndex: number; name: string; slot: number; count: number };

export interface SortLayout {
    /** Every element's id, in render order (the SortableContext's items). */
    items: string[];
    elements: Map<string, SortElement>;
    /** Each unit's leader id, its name, and (for a station block) its stations' names. */
    units: Array<{ leaderId: string; name: string; stations: string[] }>;
}

export type SortMove = { scope: "unit" | "station"; fromIndex: number; toIndex: number };

/**
 * The layout of the flat list, from its units in order. A unit of one row is
 * its own leader (id = the row's id); a station block leads with its header
 * (`headerId`) and lists its stations.
 */
export function buildSortLayout(
    units: Array<{ rows: Array<{ id: string; index: number; name: string }>; headerId?: string; name: string }>,
): SortLayout {
    const items: string[] = [];
    const elements = new Map<string, SortElement>();
    const leaders: SortLayout["units"] = [];
    units.forEach((entry, unit) => {
        const [first] = entry.rows;
        if (!first) return;
        if (entry.rows.length === 1 || !entry.headerId) {
            items.push(first.id);
            elements.set(first.id, { kind: "unit", unit, rowIndex: first.index, name: entry.name });
            leaders.push({ leaderId: first.id, name: entry.name, stations: [] });
            return;
        }
        items.push(entry.headerId);
        elements.set(entry.headerId, { kind: "unit", unit, rowIndex: first.index, name: entry.name });
        leaders.push({ leaderId: entry.headerId, name: entry.name, stations: entry.rows.map((row) => row.name) });
        entry.rows.forEach((row, slot) => {
            items.push(row.id);
            elements.set(row.id, { kind: "station", unit, rowIndex: row.index, name: row.name, slot, count: entry.rows.length });
        });
    });
    return { items, elements, units: leaders };
}

/** Whether `id` may take a drop while `activeId` is dragged: unit onto unit, station onto a station of its block. */
export function isDropTarget(layout: SortLayout, activeId: UniqueIdentifier | null, id: string): boolean {
    if (activeId === null) return true;
    const active = layout.elements.get(String(activeId));
    const element = layout.elements.get(id);
    if (!active || !element) return false;
    if (active.kind === "unit") return element.kind === "unit";
    return element.kind === "station" && element.unit === active.unit;
}

/** The edit a drop makes, or null when it moves nothing (no target, itself, or out of scope). */
export function dropMove(layout: SortLayout, activeId: UniqueIdentifier, overId: UniqueIdentifier | null | undefined): SortMove | null {
    if (overId == null || activeId === overId || !isDropTarget(layout, activeId, String(overId))) return null;
    const active = layout.elements.get(String(activeId));
    const over = layout.elements.get(String(overId));
    if (!active || !over) return null;
    if (active.kind === "unit") return active.unit === over.unit ? null : { scope: "unit", fromIndex: active.rowIndex, toIndex: over.rowIndex };
    return { scope: "station", fromIndex: active.rowIndex, toIndex: over.rowIndex };
}

/**
 * The slots a drag reorders, as flat item indices: the units' leaders while a
 * unit is dragged, the block's stations while a station is.
 */
function dragSlots(layout: SortLayout, active: SortElement): number[] {
    return layout.items
        .map((id, index) => ({ element: layout.elements.get(id), index }))
        .filter(({ element }) => element && (active.kind === "unit" ? element.kind === "unit" : element.kind === "station" && element.unit === active.unit))
        .map(({ index }) => index);
}

/**
 * How far slot `s` shifts while slot `a` is over slot `o` (an array move):
 * the dragged slot lands in o's place, and the slots between close the gap.
 * Uses each slot's measured top and bottom, so mixed heights and the list's
 * spacing are kept. null = it stays put (or a rect isn't measured yet).
 */
export function slotShift(rects: ReadonlyArray<ClientRect | undefined>, a: number, o: number, s: number): number | null {
    if (a === o) return null;
    const at = (k: number) => rects[k];
    const ra = at(a);
    if (!ra) return null;
    if (s === a) {
        const ro = at(o);
        if (!ro) return null;
        return o > a ? ro.bottom - ra.bottom : ro.top - ra.top;
    }
    if (o > a && s > a && s <= o) {
        const next = at(a + 1);
        return next ? ra.top - next.top : null;
    }
    if (o < a && s >= o && s < a) {
        const previous = at(a - 1);
        return previous ? ra.bottom - previous.bottom : null;
    }
    return null;
}

/** The SortableContext strategy: each element moves with its slot (a block's cards with its header). */
export function sessionSortStrategy(layout: SortLayout): SortingStrategy {
    return ({ rects, activeIndex, overIndex, index }) => {
        const active = layout.elements.get(layout.items[activeIndex]);
        const over = layout.elements.get(layout.items[overIndex]);
        const element = layout.elements.get(layout.items[index]);
        if (!active || !over || !element || !isDropTarget(layout, layout.items[activeIndex], layout.items[overIndex])) return null;
        const slots = dragSlots(layout, active);
        const slotOf = (el: SortElement, flat: number): number => {
            if (active.kind === "station") return el.kind === "station" && el.unit === active.unit ? slots.indexOf(flat) : -1;
            return el.unit;
        };
        const s = slotOf(element, index);
        if (s < 0) return null;
        const y = slotShift(slots.map((flat) => rects[flat]), slotOf(active, activeIndex), slotOf(over, overIndex), s);
        return y === null ? null : { x: 0, y, scaleX: 1, scaleY: 1 };
    };
}

/**
 * The drop target is the one the dragged element's middle is over, else the
 * nearest by center. Plain closest-center misjudges a tall block: a short
 * drill moved past it (bottoms aligned, as the keyboard does) is nearer the
 * next unit's center than the block's, so it would skip a place.
 */
export const sessionCollision: CollisionDetection = (args) => {
    const middle = args.collisionRect.top + args.collisionRect.height / 2;
    const under = args.droppableContainers.filter((container) => {
        const rect = args.droppableRects.get(container.id);
        return rect !== undefined && middle >= rect.top && middle <= rect.bottom;
    });
    return closestCenter(under.length > 0 ? { ...args, droppableContainers: under } : args);
};

/** Where a drag would land, for the announcements: "position 3 of 8" or "station 2 of 3". */
function placeText(layout: SortLayout, over: SortElement): string {
    return over.kind === "unit" ? `position ${over.unit + 1} of ${layout.units.length}` : `station ${over.slot + 1} of ${over.count}`;
}

function nameOf(layout: SortLayout, id: UniqueIdentifier): string {
    return layout.elements.get(String(id))?.name ?? "the item";
}

/** Screen-reader announcements in the list's own words. */
export function sessionSortAnnouncements(layout: SortLayout): Announcements {
    const landing = (activeId: UniqueIdentifier, overId: UniqueIdentifier | undefined): string | null => {
        if (overId === undefined || !isDropTarget(layout, activeId, String(overId))) return null;
        const over = layout.elements.get(String(overId));
        return over ? placeText(layout, over) : null;
    };
    return {
        onDragStart: ({ active }) => {
            const element = layout.elements.get(String(active.id));
            return element ? `Picked up ${element.name}, at ${placeText(layout, element)}.` : undefined;
        },
        onDragOver: ({ active, over }) => {
            const place = landing(active.id, over?.id);
            return place ? `${nameOf(layout, active.id)} is over ${place}.` : `${nameOf(layout, active.id)} is no longer over a place it can move to.`;
        },
        onDragEnd: ({ active, over }) => {
            if (!dropMove(layout, active.id, over?.id)) return `${nameOf(layout, active.id)} was dropped where it started.`;
            return `Moved ${nameOf(layout, active.id)} to ${landing(active.id, over?.id)}.`;
        },
        onDragCancel: ({ active }) => `Moving ${nameOf(layout, active.id)} was cancelled. It is back where it started.`,
    };
}

export const SORT_INSTRUCTIONS =
    "To move a drill or block, press space or enter on its drag handle. Use the up and down arrow keys to move it, " +
    "then press space or enter to drop it, or escape to cancel. A station moves within its block.";

/** Measures a block header as its whole block: the header and the station cards that follow it. */
function measureUnit(element: HTMLElement): ClientRect {
    const rect = getClientRect(element, { ignoreTransform: true });
    const unit = element.getAttribute("data-sort-leader");
    if (!unit) return rect;
    let { top, left, right, bottom } = rect;
    for (let next = element.nextElementSibling; next && next.getAttribute("data-sort-unit") === unit; next = next.nextElementSibling) {
        const member = getClientRect(next, { ignoreTransform: true });
        top = Math.min(top, member.top);
        left = Math.min(left, member.left);
        right = Math.max(right, member.right);
        bottom = Math.max(bottom, member.bottom);
    }
    return { top, left, right, bottom, width: right - left, height: bottom - top };
}

const MEASURING = { draggable: { measure: measureUnit }, droppable: { measure: measureUnit } };

interface SortState {
    layout: SortLayout;
    activeId: UniqueIdentifier | null;
    /** No move handlers: render no handles. */
    enabled: boolean;
    /** The session is being created: handles show but can't drag. */
    locked: boolean;
}

const SortStateContext = createContext<SortState | null>(null);

export interface SessionSortableProps {
    layout: SortLayout;
    /** Absent = no drag and drop (no handles). */
    onMove?: (move: SortMove) => void;
    locked?: boolean;
    children: ReactNode;
}

/** The list's DndContext, one SortableContext over every element, and the drag preview. */
export function SessionSortable({ layout, onMove, locked = false, children }: SessionSortableProps) {
    const dndId = useId();
    const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
    // Mouse (not pointer) beside touch, so a touch never starts both sensors; touch waits so the page still scrolls.
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );
    const strategy = useMemo(() => sessionSortStrategy(layout), [layout]);
    const accessibility = useMemo(
        () => ({ announcements: sessionSortAnnouncements(layout), screenReaderInstructions: { draggable: SORT_INSTRUCTIONS } }),
        [layout],
    );
    const state = useMemo<SortState>(() => ({ layout, activeId, enabled: Boolean(onMove), locked }), [layout, activeId, onMove, locked]);
    const active = activeId === null ? undefined : layout.elements.get(String(activeId));
    const activeUnit = active?.kind === "unit" ? layout.units[active.unit] : undefined;

    const handleDragStart = ({ active: started }: DragStartEvent) => setActiveId(started.id);
    const handleDragEnd = ({ active: ended, over }: DragEndEvent) => {
        setActiveId(null);
        const move = dropMove(layout, ended.id, over?.id);
        if (move && onMove && !locked) onMove(move);
    };

    return (
        <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={sessionCollision}
            measuring={MEASURING}
            accessibility={accessibility}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
        >
            <SortableContext items={layout.items} strategy={strategy}>
                <SortStateContext.Provider value={state}>{children}</SortStateContext.Provider>
            </SortableContext>
            <DragOverlay>
                {active ? (
                    <Paper
                        elevation={8}
                        sx={{ px: 2, py: 1.5, borderLeft: 4, borderColor: "primary.main", cursor: "grabbing", maxWidth: 480 }}
                    >
                        <Stack direction="row" spacing={1} alignItems="center">
                            <DragIndicatorIcon color="action" />
                            <Typography variant="subtitle1" sx={{ fontWeight: 800 }} noWrap>
                                {activeUnit && activeUnit.stations.length > 0 ? `Stations · ${activeUnit.stations.length}` : active.name}
                            </Typography>
                        </Stack>
                        {activeUnit && activeUnit.stations.length > 0 && (
                            <Typography variant="body2" color="text.secondary" noWrap sx={{ pl: 4 }}>
                                {activeUnit.stations.join(" · ")}
                            </Typography>
                        )}
                    </Paper>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}

/** The handle's accessible name. */
export function dragHandleLabel(name: string): string {
    return `Drag to reorder ${name}`;
}

/**
 * One element of the flat list. It keeps the key its card always had, so the
 * card inside never remounts; `children` gets the drag handle (null when the
 * list has no drag and drop) to place among its controls.
 */
export function SortableSessionRow({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
    const state = useContext(SortStateContext);
    const layout = state?.layout;
    const element = layout?.elements.get(id);
    const activeId = state?.activeId ?? null;
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({
        id,
        disabled: {
            draggable: !state?.enabled || state.locked || !element,
            droppable: !layout || !isDropTarget(layout, activeId, id),
        },
    });
    const active = activeId === null ? undefined : layout?.elements.get(String(activeId));
    // The whole dragged unit (a block's header and its cards) stays as a faded placeholder.
    const dragged = Boolean(active && element && (activeId === id || (active.kind === "unit" && element.kind === "station" && element.unit === active.unit)));
    const leaderOf = element ? layout?.units[element.unit]?.leaderId : undefined;

    const handle =
        state?.enabled && element ? (
            <IconButton
                ref={setActivatorNodeRef}
                {...attributes}
                {...listeners}
                disabled={state.locked}
                aria-label={dragHandleLabel(element.name)}
                sx={{
                    // && outranks a parent's "& .MuiIconButton-root" sizing (the card's actions).
                    "&&": { minWidth: 44, minHeight: 44 },
                    touchAction: "none",
                    cursor: state.locked ? "default" : "grab",
                    "&:active": { cursor: state.locked ? "default" : "grabbing" },
                }}
            >
                <DragIndicatorIcon />
            </IconButton>
        ) : null;

    return (
        <Box
            ref={setNodeRef}
            data-sort-id={id}
            data-sort-unit={leaderOf}
            data-sort-leader={element?.kind === "unit" && leaderOf === id ? id : undefined}
            style={{ transform: CSS.Translate.toString(transform), transition }}
            sx={{ position: "relative", opacity: dragged ? 0.4 : 1 }}
        >
            {children(handle)}
        </Box>
    );
}
