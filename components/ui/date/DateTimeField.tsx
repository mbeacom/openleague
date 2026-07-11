"use client";

/**
 * DateTimeField — shared wrapper over MUI X's responsive DateTimePicker
 * (popover on desktop, dialog on touch). Self-contained: carries its own
 * LocalizationProvider so isolated renders (tests, storybook) work without
 * the app-wide provider in ThemeProvider; nesting is supported by MUI X.
 *
 * Public API speaks the wall-clock string 'YYYY-MM-DDTHH:MM' (same format as
 * native datetime-local inputs and lib/utils/date.ts helpers). Supports both
 * controlled (value + onChange) and uncontrolled (defaultValue + hidden
 * input) usage; when `name` is given a hidden input carries the canonical
 * string so FormData-based forms work unchanged.
 */

import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import {
  type BaseFieldProps,
  formatDateTimeValue,
  parseDateTimeValue,
  useDateFieldState,
} from "./internal";

export interface DateTimeFieldProps extends BaseFieldProps {
  /** Earliest selectable instant, as 'YYYY-MM-DDTHH:MM'. */
  minDateTime?: string;
  /** @default 5 */
  minutesStep?: number;
}

export function DateTimeField({
  label,
  name,
  value,
  defaultValue,
  onChange,
  required,
  disabled,
  error,
  helperText,
  minDateTime,
  fullWidth = true,
  minutesStep = 5,
}: DateTimeFieldProps) {
  const { displayValue, canonicalValue, handleChange } = useDateFieldState(
    parseDateTimeValue,
    formatDateTimeValue,
    { value, defaultValue, onChange }
  );

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <DateTimePicker
        label={label}
        value={displayValue}
        onChange={handleChange}
        disabled={disabled}
        minDateTime={parseDateTimeValue(minDateTime) ?? undefined}
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
