import * as React from "react";
import { Modal, Platform, Pressable, Text, View } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isAtLeast16 } from "@/lib/profile-setup/validation";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { EloField } from "./elo-form-field";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Local date -> YYYY-MM-DD (avoids the UTC shift of toISOString). */
function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** YYYY-MM-DD -> local noon Date (noon dodges DST edge cases). */
function fromYmd(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const d = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDob(value: string): string | null {
  const d = fromYmd(value);
  if (!d) return null;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

interface DateOfBirthPickerProps {
  value: string;
  onChange: (dateOfBirth: string) => void;
}

export function DateOfBirthPicker({ value, onChange }: DateOfBirthPickerProps) {
  const tokens = useThemedTokens();
  const insets = useSafeAreaInsets();
  const [iosOpen, setIosOpen] = React.useState(false);
  // Track whether the user actually moved the iOS spinner; without this, tapping
  // "Done" without scrolling would silently commit the default (today minus 16y).
  const [touched, setTouched] = React.useState(false);

  const now = new Date();
  // Under-16 cannot be selected; default the picker to the 16th birthday cutoff.
  const maximumDate = React.useMemo(
    () => new Date(now.getFullYear() - 16, now.getMonth(), now.getDate()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const minimumDate = React.useMemo(
    () => new Date(now.getFullYear() - 100, now.getMonth(), now.getDate()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const selectedDate = fromYmd(value) ?? maximumDate;
  // iOS draft: the spinner emits continuously, commit on "Done".
  const [draft, setDraft] = React.useState<Date>(selectedDate);

  const commit = (date: Date) => onChange(toYmd(date));

  const openAndroid = () => {
    DateTimePickerAndroid.open({
      value: selectedDate,
      mode: "date",
      display: "default",
      maximumDate,
      minimumDate,
      onChange: (event: DateTimePickerEvent, date?: Date) => {
        if (event.type === "set" && date) commit(date);
      },
    });
  };

  const open = () => {
    if (Platform.OS === "android") {
      openAndroid();
      return;
    }
    setDraft(fromYmd(value) ?? maximumDate);
    setTouched(false);
    setIosOpen(true);
  };

  const confirmIos = () => {
    // Only commit if the user interacted (or is editing an existing value), so a
    // new user cannot tap "Done" through to an unintended default date.
    if (touched || value) commit(draft);
    setIosOpen(false);
  };

  const formatted = formatDob(value);
  const hasUnderageError = Boolean(value && !isAtLeast16(value));
  const errorMsg = hasUnderageError ? "You must be at least 16 to compete." : null;
  const helper = !value ? "You must be at least 16 to compete." : undefined;

  return (
    <EloField label="Date of Birth" helper={helper} error={errorMsg}>
      <Pressable onPress={open} accessibilityRole="button">
        <View className="bg-surface-3 border border-hairline-strong rounded-xs h-12 px-4 flex-row items-center">
          <Text
            className={`text-[14px] font-body flex-1 ${formatted ? "text-ink" : "text-ink-3"}`}
            numberOfLines={1}
          >
            {formatted ?? "Select your date of birth"}
          </Text>
        </View>
      </Pressable>

      {Platform.OS === "ios" && (
        <Modal
          visible={iosOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setIosOpen(false)}
          statusBarTranslucent
        >
          <Pressable
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
            onPress={() => setIosOpen(false)}
          >
            <View
              style={{
                flex: 1,
                justifyContent: "flex-end",
                paddingBottom: insets.bottom || 16,
              }}
            >
              <Pressable
                onPress={(e) => e.stopPropagation()}
                style={{
                  backgroundColor: tokens.card,
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                  paddingTop: 8,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                  }}
                >
                  <Pressable onPress={confirmIos} hitSlop={8} accessibilityRole="button">
                    <Text className="font-heading text-[14px] text-cta uppercase tracking-caps-l">
                      Done
                    </Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={draft}
                  mode="date"
                  display="spinner"
                  maximumDate={maximumDate}
                  minimumDate={minimumDate}
                  textColor={tokens.cardForeground}
                  onChange={(_event, date) => {
                    setTouched(true);
                    if (date) setDraft(date);
                  }}
                />
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      )}
    </EloField>
  );
}
