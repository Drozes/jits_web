/**
 * WP7 (jits-3eeg.8, R3 A1-2): every text input and switch has an accessible
 * name. React Native does not tie a sibling <Text> label to an input, so the
 * visible label has to be passed as `accessibilityLabel`.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";

let mockScheme: "dark" | "light" = "dark";
jest.mock("@/lib/theme/use-theme", () => {
  const { darkTokens, lightTokens } = jest.requireActual("@/lib/tokens");
  return {
    useResolvedColorScheme: () => mockScheme,
    useThemedTokens: () => (mockScheme === "dark" ? darkTokens : lightTokens),
  };
});

import { Switch } from "@/components/ui/switch";
import { EloField, EloTextInput } from "@/components/profile-setup/elo-form-field";
import { useAmber } from "@/components/match-detail/use-amber";
import { AuthFormField } from "@/components/auth/auth-form-field";
import { darkTokens, lightTokens } from "@/lib/tokens";

declare const require: (id: string) => any;
declare const __dirname: string;

describe("ui Switch", () => {
  it("takes its required label as the accessible name", () => {
    const { getByLabelText } = render(<Switch label="Challenges" value={false} />);
    expect(getByLabelText("Challenges")).toBeTruthy();
  });

  it("keeps a caller's other props (value, testID)", () => {
    const { getByTestId } = render(<Switch label="Flag" value testID="sw" />);
    expect(getByTestId("sw").props.accessibilityLabel).toBe("Flag");
    expect(getByTestId("sw").props.value).toBe(true);
  });
});

describe("EloTextInput inside EloField", () => {
  it("defaults its accessible name to the field's visible label", () => {
    const { getByTestId } = render(
      <EloField label="First name">
        <EloTextInput testID="first" />
      </EloField>,
    );
    expect(getByTestId("first").props.accessibilityLabel).toBe("First name");
  });

  it("an explicit accessibilityLabel wins", () => {
    const { getByTestId } = render(
      <EloField label="Instagram">
        <EloTextInput testID="ig" accessibilityLabel="Instagram handle" />
      </EloField>,
    );
    expect(getByTestId("ig").props.accessibilityLabel).toBe("Instagram handle");
  });

  it("has no label outside a field unless one is passed", () => {
    const { getByTestId } = render(<EloTextInput testID="bare" />);
    expect(getByTestId("bare").props.accessibilityLabel).toBeUndefined();
  });
});

describe("AuthFormField", () => {
  it("names its input with the visible label (iOS ignores accessibilityLabelledBy)", () => {
    const { getByLabelText } = render(<AuthFormField label="Email" testID="email" />);
    expect(getByLabelText("Email").props.testID).toBe("email");
  });

  it("a caller's accessibilityLabel still wins", () => {
    const { getByTestId } = render(
      <AuthFormField label="Password" accessibilityLabel="Account password" testID="pw" secureTextEntry />,
    );
    expect(getByTestId("pw").props.accessibilityLabel).toBe("Account password");
  });
});

describe("EloField visible label", () => {
  it("is hidden from assistive tech, since the input carries the name", () => {
    const { getByText } = render(
      <EloField label="Weight">
        <EloTextInput testID="w" />
      </EloField>,
    );
    const label = getByText("Weight", { includeHiddenElements: true });
    expect(label.props.accessible).toBe(false);
    expect(label.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(label.props.accessibilityElementsHidden).toBe(true);
  });

  it("stays readable when the field holds a control that does not take the name", () => {
    const { getByText } = render(
      <EloField label="Home Gym">
        <EloTextInput testID="g" accessibilityLabel="Gym search" />
      </EloField>,
    );
    expect(getByText("Home Gym").props.accessible).toBeUndefined();
  });
});

describe("useAmber reads the attention token", () => {
  function Probe({ onValue }: { onValue: (v: ReturnType<typeof useAmber>) => void }) {
    onValue(useAmber());
    return null;
  }

  it.each([
    ["dark", darkTokens.attention],
    ["light", lightTokens.attention],
  ] as const)("%s: token classes and the token's icon color", (scheme, icon) => {
    mockScheme = scheme;
    let value: ReturnType<typeof useAmber> | undefined;
    render(<Probe onValue={(v) => (value = v)} />);
    expect(value).toEqual({ text: "text-attention", border: "border-attention", icon });
  });
});

describe("guard: no unlabeled TextInput or Switch in app/ or components/", () => {
  const fs = require("fs");
  const path = require("path");
  const MOBILE_ROOT = path.resolve(__dirname, "..", "..");
  // A JSX opening tag (not a type argument such as `useRef<TextInput>`).
  const OPEN_TAG = /<(TextInput|BottomSheetTextInput|Switch|RNSwitch)\s/g;

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(full, out);
      } else if (/\.tsx$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  /** The text of the opening tag starting at `start`, braces balanced. */
  function openingTag(src: string, start: number): string {
    let depth = 0;
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) return src.slice(start, i + 1);
    }
    return src.slice(start);
  }

  const sites = ["app", "components"]
    .flatMap((dir) => walk(path.join(MOBILE_ROOT, dir)))
    .flatMap((file: string) => {
      const src: string = fs.readFileSync(file, "utf8");
      return [...src.matchAll(OPEN_TAG)].map((m) => ({
        where: `${path.relative(MOBILE_ROOT, file)}:${src.slice(0, m.index).split("\n").length}`,
        tag: openingTag(src, m.index ?? 0),
      }));
    });

  it("finds the controls (the scan is not vacuous)", () => {
    expect(sites.length).toBeGreaterThan(10);
  });

  /**
   * Thin wrappers whose label legitimately arrives through a `{...props}`
   * spread from their callers. Only these files may rely on a spread; any
   * other control must name itself.
   */
  const SPREAD_WRAPPERS = new Set(["components/ui/switch.tsx"]);

  it("every one carries accessibilityLabel or a Switch label (spread only in allowlisted wrappers)", () => {
    const missing = sites
      .filter(({ where, tag }: { where: string; tag: string }) => {
        if (/accessibilityLabel|\blabel=/.test(tag)) return false;
        const file = where.replace(/:\d+$/, "");
        return !(SPREAD_WRAPPERS.has(file) && /\{\.\.\./.test(tag));
      })
      .map(({ where }: { where: string }) => where);
    expect(missing).toEqual([]);
  });
});
