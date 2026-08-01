// Cross-mode state: a received file can be handed straight to the sender
// ("send onward" relay), so the payload lives here, not inside either mode.

export interface PendingFile {
  payload: Uint8Array;
  name: string;
  mime: string;
}

export const store: { pending: PendingFile | null } = { pending: null };
