/**
 * The Terms of Service or the Privacy Policy, full text, as a modal over
 * whatever opened it (jits-rog5.8): profile setup, invite setup, Settings.
 * It lives on the root stack, outside `(app)`, so it opens signed out too.
 *
 * `doc` is `terms` or `privacy` (anything else falls back to the Terms);
 * `?lang=fr` opens the French version; `?section=5` opens it at a numbered
 * section (jits-rog5.10). English is the default for now; opening in French
 * first for Quebec users is jits-rog5.3.
 *
 * Navigation (jits-rog5.10):
 * - Header, two rows so it works at 320pt: row 1 the title, Contents and
 *   Close; row 2 the Terms | Privacy switch and EN | FR. Both switches act in
 *   place, and each keeps the other's choice.
 * - Contents opens a panel over the text inside this modal, listing the
 *   document's H2 sections (components/legal/contents-panel.tsx); a tap jumps
 *   there, and Android back closes it. Not a gorhom sheet: its portal lives in
 *   the root layout, under this native modal, so it would open behind it.
 * - In-text references ("Section 5", "Privacy Policy") jump to the section
 *   or switch document.
 * Jumps use FlatList.scrollToIndex through `useListJump` (lib/legal): rows
 * have variable heights, so a jump to a row not measured yet scrolls near it
 * and retries, bounded, and only for the latest jump.
 */
import * as React from "react";
import { BackHandler, FlatList, Platform, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { List, X } from "lucide-react-native";
import {
  LEGAL_DOCUMENTS,
  LEGAL_DOC_IDS,
  LEGAL_LANGS,
  documentOutline,
  isLegalDocId,
  isLegalLang,
  parseLegalDocument,
  sectionIndex,
  type LegalBlock,
  type LegalDocId,
  type LegalLang,
  type LegalRefTarget,
} from "@jits/shared/legal";
import { ContentsPanel } from "@/components/legal/contents-panel";
import { LegalDocumentList } from "@/components/legal/legal-document";
import { Chip } from "@/components/ui/elo-system/chip";
import { selectionSurface } from "@/components/ui/elo-system/selection";
import { PressableScale } from "@/components/ui/pressable-scale";
import { StatePressable } from "@/components/ui/state-pressable";
import {
  LEGAL_CLOSE_LABEL,
  LEGAL_CONTENTS_LABEL,
  LEGAL_SHORT_TITLE,
  LEGAL_SWITCH_LABEL,
} from "@/lib/legal/legal-copy";
import { useListJump } from "@/lib/legal/use-list-jump";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";

/** Dynamic Type cap for the header labels: the same 1.3x as the header status chip (CHIP_MAX_FONT_SCALE). */
const HEADER_MAX_FONT_SCALE = 1.3;

/**
 * The Contents panel lists the H2 sections, minus the document's own
 * in-text "Contents" H2 (an unnumbered heading over the linked contents list).
 */
function contentsEntries(blocks: LegalBlock[]) {
  return documentOutline(blocks).filter((e) => {
    if (e.level !== 2) return false;
    const next = blocks[e.index + 1];
    const isOwnContents =
      e.section === null && next?.kind === "ordered" && next.items.every((item) => item.length === 1 && item[0].kind === "ref");
    return !isOwnContents;
  });
}

export default function LegalDocumentScreen() {
  const params = useLocalSearchParams<{ doc?: string; lang?: string; section?: string }>();
  const [doc, setDoc] = React.useState<LegalDocId>(isLegalDocId(params.doc) ? params.doc : "terms");
  // TODO(jits-rog5.3): default to French for Quebec users.
  const [lang, setLang] = React.useState<LegalLang>(isLegalLang(params.lang) ? params.lang : "en");
  const [pendingSection, setPendingSection] = React.useState<string | null>(params.section ?? null);
  const [contentsOpen, setContentsOpen] = React.useState(false);
  const router = useRouter();
  const tokens = useThemedTokens();
  const insets = useSafeAreaInsets();
  const listRef = React.useRef<FlatList<LegalBlock>>(null);
  const { jumpTo, onScrollToIndexFailed } = useListJump(listRef, `${doc}-${lang}`);

  const blocks = React.useMemo(() => parseLegalDocument(doc, LEGAL_DOCUMENTS[doc][lang].markdown), [doc, lang]);
  const sections = React.useMemo(() => sectionIndex(blocks), [blocks]);
  const outline = React.useMemo(() => contentsEntries(blocks), [blocks]);

  // Android back closes an open Contents panel, not the modal.
  React.useEffect(() => {
    if (!contentsOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setContentsOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [contentsOpen]);

  // A section asked for by the link, a reference or a document switch: jump
  // once the (re)mounted list has laid out its first rows.
  React.useEffect(() => {
    if (!pendingSection) return;
    const index = sections.get(pendingSection);
    setPendingSection(null);
    // Not cancelled on cleanup: clearing the pending section re-runs this
    // effect at once, and the jump must still happen.
    if (index !== undefined) requestAnimationFrame(() => jumpTo(index));
  }, [pendingSection, sections, jumpTo]);

  const onRef = React.useCallback(
    (target: LegalRefTarget) => {
      if (target.doc !== doc) setDoc(target.doc);
      if (target.section) setPendingSection(target.section);
    },
    [doc],
  );

  // On a cold open (a deep link) there is nothing to go back to: Close goes
  // home, while Android's hardware back would leave the app.
  const close = React.useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  // An iOS modal is a sheet below the status bar; Android draws it full screen.
  const top = Platform.OS === "ios" ? 0 : insets.top;

  return (
    <View className="flex-1 bg-surface">
      <View className="bg-surface-2 border-b border-hairline px-4 pb-2" style={{ paddingTop: top }}>
        <View className="flex-row items-center gap-2" style={{ minHeight: 52 }}>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE}
            numberOfLines={1}
            className="flex-1 font-heading text-small text-ink-2 uppercase tracking-caps-l"
          >
            {LEGAL_SHORT_TITLE[doc][lang]}
          </Text>
          <StatePressable
            dim
            testID="legal-contents"
            accessibilityRole="button"
            accessibilityState={{ expanded: contentsOpen }}
            onPress={() => setContentsOpen((v) => !v)}
            className={cn("min-h-[44px] flex-row items-center gap-1 rounded-xs border px-2", selectionSurface(contentsOpen))}
          >
            <List size={14} color={tokens.textPrimary} />
            <Text maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE} className="font-heading text-micro text-ink uppercase tracking-caps">
              {LEGAL_CONTENTS_LABEL[lang]}
            </Text>
          </StatePressable>
          <PressableScale
            testID="legal-close"
            onPress={close}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={LEGAL_CLOSE_LABEL[lang]}
            className="h-[44px] w-[44px] items-center justify-center -mr-[13px]"
          >
            <X size={20} color={tokens.textPrimary} />
          </PressableScale>
        </View>
        <View className="flex-row items-center gap-3">
          <View className="flex-1 flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel="Document">
            {LEGAL_DOC_IDS.map((d) => (
              <StatePressable
                key={d}
                dim
                testID={`legal-doc-${d}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: d === doc, checked: d === doc }}
                accessibilityLabel={LEGAL_SHORT_TITLE[d][lang]}
                onPress={() => {
                  setContentsOpen(false);
                  setDoc(d);
                }}
                className={cn("min-h-[44px] flex-1 items-center justify-center rounded-xs border px-2", selectionSurface(d === doc))}
              >
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  className={cn("font-heading text-small", d === doc ? "text-ink" : "text-ink-2")}
                >
                  {LEGAL_SWITCH_LABEL[d][lang]}
                </Text>
              </StatePressable>
            ))}
          </View>
          <View className="flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel="Language">
            {LEGAL_LANGS.map((l) => (
              <Chip
                key={l}
                testID={`legal-lang-${l}`}
                active={l === lang}
                maxFontSizeMultiplier={HEADER_MAX_FONT_SCALE}
                accessibilityRole="radio"
                accessibilityState={{ selected: l === lang, checked: l === lang }}
                accessibilityLabel={l === "en" ? "English" : "Français"}
                onPress={() => setLang(l)}
              >
                {l.toUpperCase()}
              </Chip>
            ))}
          </View>
        </View>
      </View>
      <View className="flex-1">
        <View
          className="flex-1"
          // While the Contents panel is open, the text behind it is hidden from screen readers.
          importantForAccessibility={contentsOpen ? "no-hide-descendants" : "auto"}
          accessibilityElementsHidden={contentsOpen}
          testID="legal-document-wrap"
        >
          <LegalDocumentList
            // Remount on a switch so the list starts at the top of the new text.
            key={`${doc}-${lang}`}
            ref={listRef}
            testID="legal-document"
            blocks={blocks}
            lang={lang}
            onRef={onRef}
            onScrollToIndexFailed={onScrollToIndexFailed}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: insets.bottom + 32 }}
          />
        </View>
        {contentsOpen ? (
          <ContentsPanel
            title={LEGAL_CONTENTS_LABEL[lang]}
            entries={outline}
            bottomInset={insets.bottom}
            onPick={(entry) => {
              setContentsOpen(false);
              jumpTo(entry.index);
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
