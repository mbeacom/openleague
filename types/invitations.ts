// Invitation types for the application

export interface Invitation {
  id: string;
  email: string;
  status: "PENDING" | "ACCEPTED" | "EXPIRED";
  expiresAt: Date;
  createdAt: Date;
}

// Type for invitations as they exist on the server with Date objects
export type InvitationWithDates = Invitation;

// Type for invitations when passed to client components, where dates are serialized to strings
export type InvitationForClient = Omit<Invitation, "expiresAt" | "createdAt"> & {
  expiresAt: string;
  createdAt: string;
};

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
