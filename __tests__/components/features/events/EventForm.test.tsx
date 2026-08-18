import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventForm from "@/components/features/events/EventForm";
import { createEvent, updateEvent } from "@/lib/actions/events";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/actions/events", () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
}));

vi.mock("@/components/features/venues/VenueSelector", () => ({
  default: ({ onChange }: { onChange: (id: string, name: string, timezone: string) => void }) => (
    <button
      type="button"
      onClick={() => onChange(
        "cvenue0000000000000000001",
        "North Rink",
        "America/New_York",
      )}
    >
      Select North Rink
    </button>
  ),
}));

vi.mock("@/components/ui/date", () => ({
  DateTimeField: ({
    label,
    name,
    value,
    onChange,
    required,
    helperText,
  }: {
    label: string;
    name: string;
    value: string;
    onChange: (value: string) => void;
    required?: boolean;
    helperText?: string;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
      <span>{helperText}</span>
    </label>
  ),
}));

describe("EventForm venue end time", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks end time required and shows field validation for a selected venue", async () => {
    const user = userEvent.setup();
    render(
      <EventForm
        teamId="cteam00000000000000000001"
        initialData={{
          type: "PRACTICE",
          title: "Practice",
          startAt: new Date("2099-08-01T18:00:00.000Z"),
          location: "North Rink",
          opponent: "",
          notes: "",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Select North Rink" }));

    const endAt = screen.getByLabelText("End Date & Time");
    expect(endAt).toBeRequired();
    expect(screen.getByText(/required for venue events/i)).toBeInTheDocument();

    fireEvent.submit(endAt.closest("form")!);

    expect(await screen.findByText("End date and time is required when a venue is selected"))
      .toBeInTheDocument();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("submits the selected confirmed reservation and its venue-local interval", async () => {
    vi.mocked(createEvent).mockResolvedValue({
      success: true,
      data: {
        id: "cevent0000000000000000001",
        type: "PRACTICE",
        title: "Practice",
        startAt: new Date("2099-08-01T22:00:00.000Z"),
        location: "North Rink",
        opponent: null,
        notes: null,
      },
    });
    const user = userEvent.setup();
    render(
      <EventForm
        teamId="cteam00000000000000000001"
        initialData={{
          type: "PRACTICE",
          title: "Practice",
          startAt: new Date("2099-08-01T22:00:00.000Z"),
          location: "North Rink",
          opponent: "",
          notes: "",
        }}
        reservations={[{
          id: "cres000000000000000000001",
          startsAt: "2099-08-01T22:00:00.000Z",
          endsAt: "2099-08-01T23:00:00.000Z",
          timezone: "America/New_York",
          venueId: "cvenue0000000000000000001",
          venueName: "North Rink",
          surfaceName: "Rink 1",
          segmentName: null,
        }]}
      />,
    );

    await user.click(screen.getByLabelText("Confirmed reservation"));
    await user.click(screen.getByRole("option", { name: /North Rink/ }));
    await user.click(screen.getByRole("button", { name: "Create Event" }));

    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({
      reservationId: "cres000000000000000000001",
      venueId: "cvenue0000000000000000001",
      startAt: new Date("2099-08-01T22:00:00.000Z"),
      endAt: new Date("2099-08-01T23:00:00.000Z"),
    }));
  });

  it("preserves the currently assigned reservation while editing other fields", async () => {
    vi.mocked(updateEvent).mockResolvedValue({
      success: true,
      data: {
        id: "cevent0000000000000000001",
        type: "PRACTICE",
        title: "Updated practice",
        startAt: new Date("2099-08-01T22:00:00.000Z"),
        location: "North Rink",
        opponent: null,
        notes: null,
      },
    });
    const user = userEvent.setup();
    const reservation = {
      id: "cres000000000000000000001",
      startsAt: "2099-08-01T22:00:00.000Z",
      endsAt: "2099-08-01T23:00:00.000Z",
      timezone: "America/New_York",
      venueId: "cvenue0000000000000000001",
      venueName: "North Rink",
      surfaceName: "Rink 1",
      segmentName: null,
    };
    render(
      <EventForm
        teamId="cteam00000000000000000001"
        eventId="cevent0000000000000000001"
        reservations={[reservation]}
        initialData={{
          type: "PRACTICE",
          title: "Practice",
          startAt: new Date(reservation.startsAt),
          endAt: new Date(reservation.endsAt),
          timezone: reservation.timezone,
          location: reservation.venueName,
          venueId: reservation.venueId,
          reservationId: reservation.id,
          opponent: "",
          notes: "",
        }}
      />,
    );

    await user.clear(screen.getByRole("textbox", { name: /Title/ }));
    await user.type(screen.getByRole("textbox", { name: /Title/ }), "Updated practice");
    await user.click(screen.getByRole("button", { name: "Update Event" }));

    expect(updateEvent).toHaveBeenCalledWith(expect.objectContaining({
      id: "cevent0000000000000000001",
      reservationId: reservation.id,
    }));
  });
});
