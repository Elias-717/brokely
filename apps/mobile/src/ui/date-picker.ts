import type { LocalDate } from "@brokely/domain";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { toDate, toLocalDate } from "../lib/today";

/** Opens Android's date picker; null if the student cancels (FR-PLN-02: any date). */
export function pickDate(initial: LocalDate): Promise<LocalDate | null> {
  return new Promise((resolve) =>
    DateTimePickerAndroid.open({
      value: toDate(initial),
      mode: "date",
      onChange: (event, picked) =>
        resolve(event.type === "set" && picked ? toLocalDate(picked) : null),
    }),
  );
}

/** Opens Android's time picker on "HH:MM"; null if the student cancels (D-94). */
export function pickTime(initial: string): Promise<string | null> {
  const [h, m] = initial.split(":").map(Number) as [number, number];
  const value = new Date();
  value.setHours(h, m, 0, 0);
  return new Promise((resolve) =>
    DateTimePickerAndroid.open({
      value,
      mode: "time",
      is24Hour: false,
      onChange: (event, picked) =>
        resolve(
          event.type === "set" && picked
            ? `${String(picked.getHours()).padStart(2, "0")}:${String(picked.getMinutes()).padStart(2, "0")}`
            : null,
        ),
    }),
  );
}
