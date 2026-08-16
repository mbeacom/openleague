import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GearPledgeForm } from "@/components/features/gear/GearPledgeForm";

describe("GearPledgeForm", () => {
  it("explains that an email address or phone number is required", () => {
    render(
      <GearPledgeForm
        token="a-valid-share-token"
        items={[{ id: "item-1", name: "Helmet", targetQty: 2, pledgedQty: 0, receivedQty: 0 }]}
        submit={vi.fn()}
      />,
    );

    expect(screen.getByText("Include at least one contact method: email or phone.")).toBeInTheDocument();
  });

  it("rotates its idempotency key after a successful pledge", async () => {
    const submit = vi.fn().mockResolvedValue({ success: true });
    const { container } = render(
      <GearPledgeForm
        token="a-valid-share-token"
        items={[{ id: "item-1", name: "Helmet", targetQty: 2, pledgedQty: 0, receivedQty: 0 }]}
        submit={submit}
      />,
    );
    const form = container.querySelector("form");
    if (!form) throw new Error("Expected pledge form");

    const submitPledge = async () => {
      fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1" } });
      fireEvent.change(screen.getByRole("textbox", { name: /your name/i }), { target: { value: "Donor" } });
      fireEvent.click(screen.getByLabelText(/I agree/));
      fireEvent.submit(form);
      await waitFor(() => expect(submit).toHaveBeenCalled());
    };

    await submitPledge();
    const firstKey = submit.mock.calls[0][0].idempotencyKey;
    await waitFor(() => expect(screen.getByText(/Thank you/)).toBeInTheDocument());

    await submitPledge();
    const secondKey = submit.mock.calls[1][0].idempotencyKey;
    expect(secondKey).not.toBe(firstKey);
  });
});
