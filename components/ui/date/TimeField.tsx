"use client";

/**
 * TimeField — shared wrapper over MUI X's responsive TimePicker (popover on
 * desktop, dialog on touch). Self-contained: carries its own
 * LocalizationProvider so isolated renders (tests, storybook) work without
 * the app-wide provider in ThemeProvider; nesting is supported by MUI X.
 *
 * Public API speaks the wall-clock string 'HH:MM' (same format as native time
 * inputs). Supports both controlled (value + onChange) and uncontrolled
 * (defaultValue + hidden input) usage; when `name` is given a hidden input
 * carries the canonical string so FormData-based forms work unchanged.
 */

import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import {
  type BaseFieldProps,
  formatTimeValue,
  parseTimeValue,
  useDateFieldState,
} from "./internal";

export interface TimeFieldProps extends BaseFieldProps {
  /** Earliest selectable time of day, as 'HH:MM'. */
  min?: string;
  /** @default 5 */
  minutesStep?: number;
}

export function TimeField({
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
  minutesStep = 5,
}: TimeFieldProps) {
  const { displayValue, canonicalValue, handleChange } = useDateFieldState(
    parseTimeValue,
    formatTimeValue,
    { value, defaultValue, onChange }
  );

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <TimePicker
        label={label}
        value={displayValue}
        onChange={handleChange}
        disabled={disabled}
        minTime={parseTimeValue(min) ?? undefined}
        minutesStep={minutesStep}
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
