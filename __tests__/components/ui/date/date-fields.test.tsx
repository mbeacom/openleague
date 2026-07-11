/**
 * Tests for the shared date/time field wrappers (components/ui/date).
 *
 * The public API of these components speaks canonical wall-clock strings
 * ('YYYY-MM-DDTHH:MM' / 'YYYY-MM-DD' / 'HH:MM'); the internal display Date is
 * presentation-only. These tests cover the string→display→string round-trip,
 * hidden-input emission for FormData forms, empty/clear behavior, and that
 * invalid input never emits garbage.
 */

import { ThemeProvider } from "@mui/material/styles";
import { render, renderHook, screen, act, fireEvent, within } from "@testing-library/react";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import theme from "@/lib/theme";
import { DateTimeField } from "@/components/ui/date/DateTimeField";
import { DateField } from "@/components/ui/date/DateField";
import { TimeField } from "@/components/ui/date/TimeField";
import {
  formatDateTimeValue,
  formatDateValue,
  formatTimeValue,
  parseDateTimeValue,
  parseDateValue,
  parseTimeValue,
  useDateFieldState,
} from "@/components/ui/date/internal";

// jsdom's matchMedia never matches, which would force the pickers into their
// mobile (read-only field + dialog) variant. Match MUI's desktop media query
// ('(pointer: fine)') so the desktop popover variant renders in tests.
const originalMatchMedia = window.matchMedia;

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("pointer: fine"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterAll(() => {
  window.matchMedia = originalMatchMedia;
});

function renderField(ui: React.ReactElement) {
  return render(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns}>{ui}</LocalizationProvider>
    </ThemeProvider>
  );
}

function hiddenInput(name: string): HTMLInputElement | null {
  return document.querySelector(`input[type="hidden"][name="${name}"]`);
}

/** Open the picker's popover via its toolbar button and return the dialog. */
function openPicker(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: /Choose (date|time)/ }));
  return screen.getByRole("dialog");
}

describe("canonical string ↔ display Date conversion", () => {
  it("round-trips 'YYYY-MM-DDTHH:MM'", () => {
    const date = parseDateTimeValue("2026-07-11T14:30");
    expect(date).toEqual(new Date(2026, 6, 11, 14, 30));
    expect(formatDateTimeValue(date)).toBe("2026-07-11T14:30");
  });

  it("round-trips 'YYYY-MM-DD'", () => {
    const date = parseDateValue("2026-07-11");
    expect(date).toEqual(new Date(2026, 6, 11));
    expect(formatDateValue(date)).toBe("2026-07-11");
  });

  it("round-trips 'HH:MM' (including zero-padding)", () => {
    const date = parseTimeValue("09:05");
    expect(date?.getHours()).toBe(9);
    expect(date?.getMinutes()).toBe(5);
    expect(formatTimeValue(date)).toBe("09:05");
  });

  it("accepts an optional seconds suffix but never emits one", () => {
    expect(formatDateTimeValue(parseDateTimeValue("2026-07-11T14:30:45"))).toBe(
      "2026-07-11T14:30"
    );
    expect(formatTimeValue(parseTimeValue("14:30:45"))).toBe("14:30");
  });

  it("returns null for empty and malformed input", () => {
    for (const parse of [parseDateTimeValue, parseDateValue, parseTimeValue]) {
      expect(parse("")).toBeNull();
      expect(parse(null)).toBeNull();
      expect(parse(undefined)).toBeNull();
      expect(parse("garbage")).toBeNull();
    }
    expect(parseDateTimeValue("2026-07-11")).toBeNull();
    expect(parseDateValue("2026-07-11T14:30")).toBeNull();
    expect(parseTimeValue("25:00")).toBeNull();
    expect(parseTimeValue("12:75")).toBeNull();
  });

  it("rejects rolled-over dates and times instead of silently shifting them", () => {
    // The Date constructor would roll these into March / the next day.
    expect(parseDateTimeValue("2026-02-31T14:30")).toBeNull();
    expect(parseDateTimeValue("2026-07-11T25:00")).toBeNull();
    expect(parseDateTimeValue("2026-07-11T14:61")).toBeNull();
    expect(parseDateTimeValue("2026-13-01T14:30")).toBeNull();
    expect(parseDateValue("2026-02-31")).toBeNull();
    expect(parseDateValue("2026-13-01")).toBeNull();
    expect(parseDateValue("2026-04-31")).toBeNull();
    // Leap-day handling stays correct in both directions.
    expect(parseDateValue("2024-02-29")).toEqual(new Date(2024, 1, 29));
    expect(parseDateValue("2026-02-29")).toBeNull();
  });

  it("formats null and Invalid Date as ''", () => {
    for (const format of [formatDateTimeValue, formatDateValue, formatTimeValue]) {
      expect(format(null)).toBe("");
      expect(format(new Date(NaN))).toBe("");
    }
  });
});

describe("useDateFieldState", () => {
  it("emits the canonical string for a valid picker change", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useDateFieldState(parseDateTimeValue, formatDateTimeValue, { onChange })
    );

    act(() => result.current.handleChange(new Date(2026, 6, 11, 14, 30)));

    expect(onChange).toHaveBeenCalledWith("2026-07-11T14:30");
    expect(result.current.canonicalValue).toBe("2026-07-11T14:30");
  });

  it("emits '' (not garbage) for invalid picker input", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useDateFieldState(parseDateTimeValue, formatDateTimeValue, { onChange })
    );

    act(() => result.current.handleChange(new Date(NaN)));

    expect(onChange).toHaveBeenCalledWith("");
    expect(result.current.canonicalValue).toBe("");
  });

  it("emits '' on clear", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useDateFieldState(parseDateTimeValue, formatDateTimeValue, {
        defaultValue: "2026-07-11T14:30",
        onChange,
      })
    );

    act(() => result.current.handleChange(null));

    expect(onChange).toHaveBeenCalledWith("");
    expect(result.current.canonicalValue).toBe("");
  });

  it("re-derives the display when a controlled value prop changes", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) =>
        useDateFieldState(parseDateTimeValue, formatDateTimeValue, { value }),
      { initialProps: { value: "2026-07-11T14:30" } }
    );

    expect(result.current.displayValue).toEqual(new Date(2026, 6, 11, 14, 30));

    rerender({ value: "2026-08-01T09:00" });
    expect(result.current.displayValue).toEqual(new Date(2026, 7, 1, 9, 0));

    rerender({ value: "" });
    expect(result.current.displayValue).toBeNull();
    expect(result.current.canonicalValue).toBe("");
  });

  it("does not clobber partial (invalid) input when the parent echoes back ''", () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) =>
        useDateFieldState(parseDateTimeValue, formatDateTimeValue, { value, onChange }),
      { initialProps: { value: "" } }
    );

    const partial = new Date(NaN); // MUI emits Invalid Date while sections are incomplete
    act(() => result.current.handleChange(partial));
    expect(onChange).toHaveBeenCalledWith("");

    // Controlled parent stores the '' we emitted and passes it back down —
    // the in-progress display Date must survive.
    rerender({ value: "" });
    expect(result.current.displayValue).toBe(partial);
  });
});

describe("DateTimeField", () => {
  it("renders the hidden input with the canonical string (uncontrolled)", () => {
    renderField(
      <DateTimeField label="Starts at" name="startAt" defaultValue="2026-07-11T14:30" />
    );

    expect(hiddenInput("startAt")).toHaveValue("2026-07-11T14:30");
    // The accessible field DOM renders a labelled group of editable sections.
    expect(screen.getByRole("group", { name: /Starts at/ })).toBeInTheDocument();
  });

  it("renders empty and emits '' in the hidden input when no value is given", () => {
    renderField(<DateTimeField label="Starts at" name="startAt" />);

    expect(hiddenInput("startAt")).toHaveValue("");
  });

  it("omits the hidden input when no name is given", () => {
    renderField(<DateTimeField label="Starts at" defaultValue="2026-07-11T14:30" />);

    expect(document.querySelector('input[type="hidden"][name]')).toBeNull();
  });

  it("follows controlled value updates and clears to empty", () => {
    const { rerender } = renderField(
      <DateTimeField label="Starts at" name="startAt" value="2026-07-11T14:30" />
    );
    expect(hiddenInput("startAt")).toHaveValue("2026-07-11T14:30");

    rerender(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <DateTimeField label="Starts at" name="startAt" value="2026-12-25T09:00" />
        </LocalizationProvider>
      </ThemeProvider>
    );
    expect(hiddenInput("startAt")).toHaveValue("2026-12-25T09:00");

    rerender(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <DateTimeField label="Starts at" name="startAt" value="" />
        </LocalizationProvider>
      </ThemeProvider>
    );
    expect(hiddenInput("startAt")).toHaveValue("");
  });

  it("emits the canonical string when a day is picked", () => {
    const onChange = vi.fn();
    renderField(
      <DateTimeField
        label="Starts at"
        name="startAt"
        defaultValue="2026-07-11T14:30"
        onChange={onChange}
      />
    );

    const dialog = openPicker();
    fireEvent.click(within(dialog).getByRole("gridcell", { name: "12" }));

    expect(onChange).toHaveBeenCalledWith("2026-07-12T14:30");
    expect(hiddenInput("startAt")).toHaveValue("2026-07-12T14:30");
  });

  it("offers minutes in 5-minute steps by default", () => {
    renderField(<DateTimeField label="Starts at" defaultValue="2026-07-11T14:30" />);

    const dialog = openPicker();
    const minuteLabels = within(dialog)
      .getAllByRole("option", { name: /minutes/ })
      .map((option) => option.getAttribute("aria-label"));

    expect(minuteLabels).toContain("5 minutes");
    expect(minuteLabels).not.toContain("1 minutes");
  });
});

describe("DateField", () => {
  it("renders the hidden input with the canonical string (uncontrolled)", () => {
    renderField(<DateField label="Start date" name="startDate" defaultValue="2026-07-11" />);

    expect(hiddenInput("startDate")).toHaveValue("2026-07-11");
  });

  it("renders empty when no value is given", () => {
    renderField(<DateField label="Start date" name="startDate" />);

    expect(hiddenInput("startDate")).toHaveValue("");
  });

  it("emits the canonical string when a day is picked", () => {
    const onChange = vi.fn();
    renderField(
      <DateField label="Start date" name="startDate" defaultValue="2026-07-11" onChange={onChange} />
    );

    const dialog = openPicker();
    fireEvent.click(within(dialog).getByRole("gridcell", { name: "12" }));

    expect(onChange).toHaveBeenCalledWith("2026-07-12");
    expect(hiddenInput("startDate")).toHaveValue("2026-07-12");
  });
});

describe("TimeField", () => {
  it("renders the hidden input with the canonical string (uncontrolled)", () => {
    renderField(<TimeField label="Start time" name="startTime" defaultValue="14:30" />);

    expect(hiddenInput("startTime")).toHaveValue("14:30");
  });

  it("renders empty when no value is given", () => {
    renderField(<TimeField label="Start time" name="startTime" />);

    expect(hiddenInput("startTime")).toHaveValue("");
  });

  it("emits the canonical string when an hour is picked", () => {
    const onChange = vi.fn();
    renderField(
      <TimeField label="Start time" name="startTime" defaultValue="14:30" onChange={onChange} />
    );

    // 14:30 renders as 02:30 PM; picking hour 3 (PM) yields 15:30.
    const dialog = openPicker();
    fireEvent.click(within(dialog).getByRole("option", { name: "3 hours" }));

    expect(onChange).toHaveBeenCalledWith("15:30");
    expect(hiddenInput("startTime")).toHaveValue("15:30");
  });
});
