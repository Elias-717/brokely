type HapticsModule = typeof import("expo-haptics");
let loaded: Promise<HapticsModule | null> | undefined;

/** expo-haptics is native: builds made before it was added simply skip the buzz (D-109). */
function haptics(): Promise<HapticsModule | null> {
  loaded ??= import("expo-haptics").catch(() => null);
  return loaded;
}

/** A short, light buzz when a record is saved (D-109). Never blocks or fails the save. */
export function savedBuzz(): void {
  void haptics()
    .then((m) => m?.notificationAsync(m.NotificationFeedbackType.Success))
    .catch(() => undefined);
}

/** A stronger buzz for Brokely growing (D-109). */
export function grewBuzz(): void {
  void haptics()
    .then((m) => m?.impactAsync(m.ImpactFeedbackStyle.Heavy))
    .catch(() => undefined);
}
