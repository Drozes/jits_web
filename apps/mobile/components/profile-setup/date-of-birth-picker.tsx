import * as React from "react";
import { View } from "react-native";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isAtLeast16 } from "@/lib/profile-setup/validation";
import { EloField } from "./elo-form-field";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function parseDob(dob: string) {
  const match = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { month: "", day: "", year: "" };
  return { year: match[1], month: String(parseInt(match[2])), day: String(parseInt(match[3])) };
}

function assembleDob(month: string, day: string, year: string): string {
  if (!month || !day || !year) return "";
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

interface DateOfBirthPickerProps {
  value: string;
  onChange: (dateOfBirth: string) => void;
}

const TRIGGER_CLASS = "bg-surface-3 border-hairline-strong rounded-xs h-12 px-4";

export function DateOfBirthPicker({ value, onChange }: DateOfBirthPickerProps) {
  const initial = parseDob(value);
  const [month, setMonth] = React.useState(initial.month);
  const [day, setDay] = React.useState(initial.day);
  const [year, setYear] = React.useState(initial.year);

  const now = new Date();
  const maxYear = now.getFullYear() - 16;
  const minYear = now.getFullYear() - 100;

  const years = React.useMemo(() => {
    const result: number[] = [];
    for (let y = maxYear; y >= minYear; y--) result.push(y);
    return result;
  }, [maxYear, minYear]);

  const maxDay = month && year
    ? daysInMonth(parseInt(month), parseInt(year))
    : 31;

  const update = (nextMonth: string, nextDay: string, nextYear: string) => {
    setMonth(nextMonth);
    setDay(nextDay);
    setYear(nextYear);
    const assembled = assembleDob(nextMonth, nextDay, nextYear);
    if (assembled) onChange(assembled);
  };

  const setDobPart = (part: "month" | "day" | "year", v: string) => {
    const parts = { month, day, year, [part]: v };
    if (part === "month" && parts.day) {
      const max = daysInMonth(parseInt(v), parseInt(parts.year) || maxYear);
      if (parseInt(parts.day) > max) parts.day = String(max);
    }
    update(parts.month, parts.day, parts.year);
  };

  const hasUnderageError = Boolean(
    value && month && day && year && !isAtLeast16(value),
  );
  const errorMsg = hasUnderageError ? "You must be at least 16 to compete." : null;
  const helper = !month || !day || !year ? "You must be at least 16 to compete." : undefined;

  return (
    <EloField label="Date of Birth" helper={helper} error={errorMsg}>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Select value={month || undefined} onValueChange={(v) => setDobPart("month", v)}>
            <SelectTrigger className={TRIGGER_CLASS}>
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </View>

        <View className="w-20">
          <Select value={day || undefined} onValueChange={(v) => setDobPart("day", v)}>
            <SelectTrigger className={TRIGGER_CLASS}>
              <SelectValue placeholder="Day" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: maxDay }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{String(i + 1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </View>

        <View className="w-24">
          <Select value={year || undefined} onValueChange={(v) => setDobPart("year", v)}>
            <SelectTrigger className={TRIGGER_CLASS}>
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{String(y)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </View>
      </View>
    </EloField>
  );
}
