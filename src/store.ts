// Cross-mode state: a received file can be handed straight to the sender
// ("send onward" relay), so the payload lives here, not inside either mode.

export interface PendingFile {
  payload: Uint8Array;
  name: string;
  mime: string;
}

export const store: { pending: PendingFile | null } = { pending: null };

const activity = { send: false, receive: false };
export const transferEvents = new EventTarget();
export function setTransferActive(role: keyof typeof activity, active: boolean) {
  activity[role] = active;
  transferEvents.dispatchEvent(new Event("change"));
}
export function isTransferActive(): boolean {
  return activity.send || activity.receive;
}
