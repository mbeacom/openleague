import { redirect } from "next/navigation";

export default function EventsPage() {
  // Event browsing lives on the calendar; creation lives at /events/new.
  redirect("/calendar");
}
