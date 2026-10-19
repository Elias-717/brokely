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
