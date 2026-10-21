import type { IconName } from "../ui/icons";
import type { SyncStatus } from "./sync-provider";

/**
 * The backup state in words and a cloud icon, the same on More's profile card, Profile and
 * Backup (S13h–S13k, FR-SYNC-06). `tone` picks the colour: green when backed up, mustard when
 * something needs the student, ink otherwise.
 */
export interface BackupState {
  readonly icon: IconName;
  readonly title: string;
  readonly detail: string;
  readonly tone: "good" | "attention" | "plain";
}

const changes = (n: number) => `${n} ${n === 1 ? "change" : "changes"}`;

function since(at: Date | null): string {
  if (!at) return "";
  const minutes = Math.round((Date.now() - at.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `at ${at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function backupState(input: {
  signedIn: boolean;
  status: SyncStatus;
  waiting: number;
  needsAttention: number;
  lastSyncedAt: Date | null;
}): BackupState {
  const { signedIn, status, waiting, needsAttention, lastSyncedAt } = input;
  if (!signedIn) {
    return {
      icon: "cloud",
      title: "Back up and sync",
      detail: "Sign in to keep a copy · Optional",
      tone: "plain",
    };
  }
  if (needsAttention > 0) {
    return {
      icon: "cloud-alert",
      title: `${changes(needsAttention)} need a look`,
      detail: "Tap to see them",
      tone: "attention",
    };
  }
  if (status === "syncing")
    return {
      icon: "cloud-upload",
      title: "Backing up…",
      detail: "Right after a change",
      tone: "plain",
    };
  if (status === "offline" || status === "error") {
    return {
      icon: "cloud-off",
      title: waiting > 0 ? `${changes(waiting)} waiting` : "Not backed up just now",
      detail: status === "offline" ? "No internet, will retry" : "Will try again soon",
      tone: "plain",
    };
  }
  if (waiting > 0)
    return {
      icon: "cloud-upload",
      title: `${changes(waiting)} waiting`,
      detail: "Backing up in a moment",
      tone: "plain",
    };
  return {
    icon: "cloud-check",
    title: "Backed up",
    detail: lastSyncedAt ? since(lastSyncedAt) : "Up to date",
    tone: "good",
  };
}
