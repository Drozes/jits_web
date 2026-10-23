import * as React from "react";
import { TextInput, View } from "react-native";
import { Search } from "lucide-react-native";
import { usePalette } from "@/lib/theme/palette";
import { typeSize } from "@/lib/typography";
import { TIMEKEEPER_COPY as C } from "@/lib/match-flow/timekeeper-copy";
import { FIGHT_RADIUS } from "../fight/fight-tokens";

/**
 * The picker's search (TK-P4, board P-TK-B2 frame 2): it narrows the loaded
 * lists on the device, nothing is read. The clear control is the platform's
 * own (`clearButtonMode`), so it adds no words of its own. Focused, its edge
 * is `ink-2` (the brand's focused input, as the shipped `EloTextInput`),
 * never red; otherwise the strong hairline.
 */
export function CrewSearch({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const p = usePalette();
  const [focused, setFocused] = React.useState(false);
  return (
    <View
      testID="crew-search-field"
      style={{
        height: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingLeft: 12,
        backgroundColor: p.plate,
        borderWidth: 1,
        borderColor: focused ? p.text2 : p.strong,
        borderRadius: FIGHT_RADIUS.button,
      }}
    >
      <Search size={16} color={p.text3} />
      <TextInput
        testID="crew-search"
        accessibilityLabel={C["TK-P4"]}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={C["TK-P4"]}
        placeholderTextColor={p.text3}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        className="font-body"
        style={[typeSize("callout"), { flex: 1, height: 44, paddingRight: 8, color: p.text }]}
      />
    </View>
  );
}
