"use client";

/**
 * DateField — shared wrapper over MUI X's responsive DatePicker (popover on
 * desktop, dialog on touch). Self-contained: carries its own
 * LocalizationProvider so isolated renders (tests, storybook) work without
 * the app-wide provider in ThemeProvider; nesting is supported by MUI X.
 *
 * Public API speaks the calendar-date string 'YYYY-MM-DD' (same format as
 * native date inputs). Supports both controlled (value + onChange) and
 * uncontrolled (defaultValue + hidden input) usage; when `name` is given a
 * hidden input carries the canonical string so FormData-based forms work
 * unchanged.
 */

import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import {
  type BaseFieldProps,
  formatDateValue,
  parseDateValue,
  useDateFieldState,
} from "./internal";

export interface DateFieldProps extends BaseFieldProps {
  /** Earliest selectable day, as 'YYYY-MM-DD'. */
  min?: string;
}

export function DateField({
  label,
  name,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  error,
  helperText,
  min,
  fullWidth = true,
}: DateFieldProps) {
  const { displayValue, canonicalValue, handleChange } = useDateFieldState(
    parseDateValue,
    formatDateValue,
    { value, defaultValue, onChange }
  );

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <DatePicker
        label={label}
        value={displayValue}
        onChange={handleChange}
        disabled={disabled}
        minDate={parseDateValue(min) ?? undefined}
        slotProps={{
          textField: {
            fullWidth,
            required,
            error,
            helperText,
          },
        }}
      />
      {name && <input type="hidden" name={name} value={canonicalValue} />}
    </LocalizationProvider>
  );
}
