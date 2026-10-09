import * as React from "react";
import { NavigationContext } from "@react-navigation/native";

/**
 * Whether the enclosing screen is focused; true outside a navigator. Every
 * tab root mounts its own header, so the unfocused ones must stay quiet (the
 * status chip's countdown tick, the header rating's roll).
 * (`useIsFocused` throws outside a navigator, hence the context read.)
 */
export function useScreenFocused(): boolean {
  const navigation = React.useContext(NavigationContext);
  const [focused, setFocused] = React.useState(() => navigation?.isFocused() ?? true);
  React.useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener("focus", () => setFocused(true));
    const offBlur = navigation.addListener("blur", () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return focused;
}
