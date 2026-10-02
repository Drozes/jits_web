/**
 * Guard for WP1 (jits-3eeg.2): keeps the sheet and modal chrome from
 * drifting back. Source-level checks over `app/` and `components/`:
 *
 *  - every gorhom `BottomSheetModal` takes the shared chrome
 *    (`useSheetChrome()` from `components/ui/sheet.tsx`) and never sets its
 *    own `backgroundStyle` / `handleIndicatorStyle` (SH-1, SH-2);
 *  - every RN `Modal` takes its `animationType` from `useModalAnimation()`
 *    (or is `"none"`), never a literal `"fade"` / `"slide"` (MO-5);
 *  - no modal backdrop paints its own black literal: the one scrim is
 *    `bg-on-media-scrim` / `ON_MEDIA.scrim` (SH-4).
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../../..");
const DIRS = ["app", "components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const FILES = DIRS.flatMap((d) => walk(path.join(ROOT, d)))
  .map((full) => ({ rel: path.relative(ROOT, full).split(path.sep).join("/"), src: fs.readFileSync(full, "utf8") }));

const usesRnModal = (src: string) => /<Modal\b/.test(src);
// `\s` after the tag: a JSX element, not a `<BottomSheetModal>` mention in a comment.
const usesGorhomModal = (src: string) => /<BottomSheetModal\s/.test(src);

describe("modal chrome guard (WP1)", () => {
  it("finds the modal surfaces it guards", () => {
    expect(FILES.filter((f) => usesRnModal(f.src)).length).toBeGreaterThanOrEqual(8);
    expect(FILES.filter((f) => usesGorhomModal(f.src)).length).toBeGreaterThanOrEqual(4);
  });

  it("every BottomSheetModal spreads useSheetChrome() and sets no own background or handle", () => {
    const offenders = FILES.filter((f) => usesGorhomModal(f.src)).filter(
      (f) =>
        !/useSheetChrome\(\)/.test(f.src) ||
        /backgroundStyle=\{/.test(f.src) ||
        /handleIndicatorStyle=\{/.test(f.src),
    );
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });

  it("only components/ui/sheet.tsx renders gorhom's BottomSheetBackdrop (everyone else uses SheetBackdrop)", () => {
    const offenders = FILES.filter((f) => /<BottomSheetBackdrop\b/.test(f.src) && f.rel !== "components/ui/sheet.tsx");
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });

  it("no RN Modal hardcodes a fade or slide (use useModalAnimation for Reduce Motion)", () => {
    const offenders = FILES.filter((f) => usesRnModal(f.src) && /animationType=\{?\s*["'](fade|slide)["']/.test(f.src));
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });

  it("no modal surface paints a black literal backdrop (one scrim token)", () => {
    const offenders = FILES.filter(
      (f) => usesRnModal(f.src) && (/\bbg-black\//.test(f.src) || /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/.test(f.src)),
    );
    expect(offenders.map((f) => f.rel)).toEqual([]);
  });
});
