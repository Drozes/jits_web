"use client";

import { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export function isAtLeast16(dateOfBirth: string) {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  const age =
    now.getFullYear() -
    dob.getFullYear() -
    (now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())
      ? 1
      : 0);
  return age >= 16;
}

interface DateOfBirthPickerProps {
  value: string;
  onChange: (dateOfBirth: string) => void;
}

export function DateOfBirthPicker({ value, onChange }: DateOfBirthPickerProps) {
  const initial = parseDob(value);
  const [month, setMonth] = useState(initial.month);
  const [day, setDay] = useState(initial.day);
  const [year, setYear] = useState(initial.year);

  const now = new Date();
  const maxYear = now.getFullYear() - 16;
  const minYear = now.getFullYear() - 100;

  const years = useMemo(() => {
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

  return (
    <div className="flex flex-col gap-2">
      <Label>Date of Birth</Label>
      <div className="grid grid-cols-3 gap-2">
        <Select value={month} onValueChange={(v) => setDobPart("month", v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((name, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={day} onValueChange={(v) => setDobPart("day", v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Day" />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: maxDay }, (_, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{String(i + 1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={year} onValueChange={(v) => setDobPart("year", v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{String(y)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {value && !isAtLeast16(value) && month && day && year && (
        <p className="text-xs text-destructive">
          You must be at least 16 to compete.
        </p>
      )}
      {(!month || !day || !year) && (
        <p className="text-xs text-muted-foreground">
          You must be at least 16 to compete.
        </p>
      )}
    </div>
  );
}
