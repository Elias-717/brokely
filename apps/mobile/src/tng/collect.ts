import { ingestTngCaptures } from "@brokely/domain";
import { getTngQueue, setTngQueue } from "@brokely/local-db";
import { deleteCaptures, getCaptures, tngListenerAvailable } from "../../modules/tng-listener";
import { db, repo } from "../db/client";

/**
 * Takes the TNG transfers the listener caught into the pending list (FR-IMP-03, FR-IMP-04), then
 * deletes their raw copies (FR-IMP-11). Safe to call as often as you like: nothing is written
 * when nothing changed, and a repeated notification never makes a second import (FR-IMP-05).
 *
 * The list is saved before the raw copies are deleted, so if the app stops in between, the next
 * call finds them again and recognises them as already taken in.
 *
 * Notifications that are not a transfer Brokely understands stay where they are, as samples.
 */
export function collectTngImports(): void {
  if (!tngListenerAvailable) return; // a build made before the listener existed
  const before = getTngQueue(db);
  const { queue, consumed } = ingestTngCaptures(getCaptures(), before, Date.now());
  if (queue !== before) setTngQueue(repo, queue);
  deleteCaptures(consumed);
}
