// Invitation types for the application

export interface Invitation {
  id: string;
  email: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED";
  expiresAt: Date;
  createdAt: Date;
}

// Type for invitations returned from Server Components (dates are still Date objects)
export type InvitationWithDates = Invitation;

// Type for invitation actions
export interface SendInvitationInput {
  email: string;
  teamId: string;
}

export interface InvitationActionResult {
  success: boolean;
  error?: string;
  data?: {
    invited: boolean;
    addedDirectly?: boolean;
  };
}
