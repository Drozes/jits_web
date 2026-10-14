import * as React from "react";
import { FlatList, ScrollView, Text, View, type FlatListProps, type ListRenderItem } from "react-native";
import {
  tableLabel,
  type InlineSpan,
  type LegalBlock,
  type LegalLang,
  type LegalRefTarget,
  type TextKind,
} from "@jits/shared/legal";

/**
 * Native renderer for the legal documents (jits-rog5.8): the same
 * `LegalBlock[]` the web pages render (`@jits/shared/legal`, parsed from the
 * repo-root TERMS.md / PRIVACY_POLICY.md and their French versions), drawn
 * with RN `Text` / `View` and the ELO classes. Never HTML or a WebView: the
 * blocks are data.
 *
 * A "TBD" left in a document shows as an amber mono marker, never as final
 * text (the web marks it the same way).
 *
 * In-text references ("Section 5", "Privacy Policy"; jits-rog5.10, linked by
 * the shared `parseLegalDocument`) are tappable underlined text with the
 * link role when the caller passes `onRef`; without it they read as text.
 */

/** What a tapped reference does (switch document, jump to a section). */
export type LegalRefHandler = (target: LegalRefTarget) => void;

const RefContext = React.createContext<LegalRefHandler | undefined>(undefined);

/** Columns of a table never squeeze below this; the table scrolls sideways instead. */
export const TABLE_COLUMN_WIDTH = 168;

const PROSE = "font-body text-callout text-ink-2 leading-6";

/** So VoiceOver reads the French text with a French voice (iOS). */
const voice = (lang: LegalLang) => (lang === "fr" ? "fr-CA" : "en-CA");

const STYLE_CLASS: Record<TextKind, string | undefined> = {
  text: undefined,
  strong: "font-body-medium text-ink",
  // A real italic face (loaded in app/_layout.tsx): iOS does not slant a custom font.
  em: "font-body-italic",
};

function RefSpan({ span }: { span: Extract<InlineSpan, { kind: "ref" }> }) {
  const onRef = React.useContext(RefContext);
  if (!onRef) return <Text className={STYLE_CLASS[span.style]}>{span.text}</Text>;
  return (
    <Text
      testID={`legal-ref-${span.target.doc}-${span.target.section ?? "doc"}`}
      accessibilityRole="link"
      onPress={() => onRef(span.target)}
      className={`${STYLE_CLASS[span.style] ?? ""} text-ink underline`}
    >
      {span.text}
    </Text>
  );
}

function Spans({ spans }: { spans: InlineSpan[] }) {
  return (
    <>
      {spans.map((s, i) =>
        s.kind === "tbd" ? (
          <Text key={i} testID="legal-tbd" className="font-mono-bold tabular-nums text-attention bg-surface-4">
            {" TBD "}
          </Text>
        ) : s.kind === "ref" ? (
          <RefSpan key={i} span={s} />
        ) : s.kind === "strong" || s.kind === "em" ? (
          <Text key={i} className={STYLE_CLASS[s.kind]}>
            {s.text}
          </Text>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        ),
      )}
    </>
  );
}

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: "font-heading text-title-l text-ink",
  2: "font-heading text-subhead text-ink mt-3",
  3: "font-heading-medium text-callout text-ink mt-1",
};

function ListItems({ items, marker, lang }: { items: InlineSpan[][]; marker: (i: number) => string; lang: LegalLang }) {
  return (
    <View className="gap-2">
      {items.map((item, i) => (
        <View key={i} className="flex-row gap-2 pr-1">
          <Text className="font-mono tabular-nums text-callout text-ink-3 leading-6" style={{ minWidth: 20 }}>
            {marker(i)}
          </Text>
          <Text testID="legal-list-item" accessibilityLanguage={voice(lang)} className={`${PROSE} flex-1`}>
            <Spans spans={item} />
          </Text>
        </View>
      ))}
    </View>
  );
}

function LegalTable({ block, lang }: { block: Extract<LegalBlock, { kind: "table" }>; lang: LegalLang }) {
  const width = block.header.length * TABLE_COLUMN_WIDTH;
  const row = (cells: InlineSpan[][], header: boolean, key: React.Key) => (
    <View key={key} className={header ? "flex-row bg-surface-4" : "flex-row border-t border-hairline"}>
      {cells.map((cell, c) => (
        <View key={c} className="px-3 py-2" style={{ width: TABLE_COLUMN_WIDTH }}>
          <Text
            accessibilityLanguage={voice(lang)}
            className={header ? "font-heading text-small text-ink" : "font-body text-small text-ink-2"}
          >
            <Spans spans={cell} />
          </Text>
        </View>
      ))}
    </View>
  );
  return (
    <ScrollView
      horizontal
      testID="legal-table"
      accessibilityLabel={tableLabel(block.header, lang)}
      showsHorizontalScrollIndicator
      className="rounded-md border border-hairline"
    >
      <View style={{ width }}>
        {row(block.header, true, "h")}
        {block.rows.map((cells, r) => row(cells, false, r))}
      </View>
    </ScrollView>
  );
}

/** One block. */
export function LegalBlockView({ block, lang = "en" }: { block: LegalBlock; lang?: LegalLang }) {
  switch (block.kind) {
    case "heading":
      return (
        <Text accessibilityRole="header" accessibilityLanguage={voice(lang)} className={HEADING_CLASS[block.level]}>
          <Spans spans={block.spans} />
        </Text>
      );
    case "quote":
      return (
        <View className="border-l-2 border-hairline-strong bg-surface-2 px-3 py-2">
          <Text accessibilityLanguage={voice(lang)} className="font-body text-body text-ink-2 leading-5">
            <Spans spans={block.spans} />
          </Text>
        </View>
      );
    case "list":
      return <ListItems items={block.items} marker={() => "\u2022"} lang={lang} />;
    case "ordered":
      return <ListItems items={block.items} marker={(i) => `${block.start + i}.`} lang={lang} />;
    case "table":
      return <LegalTable block={block} lang={lang} />;
    default:
      return (
        <Text accessibilityLanguage={voice(lang)} className={PROSE}>
          <Spans spans={block.spans} />
        </Text>
      );
  }
}

/** A short run of blocks (the Terms' key points), drawn in place: no list, no virtualization. */
export function LegalBlocks({ blocks, lang = "en", onRef }: { blocks: LegalBlock[]; lang?: LegalLang; onRef?: LegalRefHandler }) {
  return (
    <RefContext.Provider value={onRef}>
      <View className="gap-3">
        {blocks.map((b, i) => (
          <LegalBlockView key={i} block={b} lang={lang} />
        ))}
      </View>
    </RefContext.Provider>
  );
}

type ListProps = Omit<FlatListProps<LegalBlock>, "data" | "renderItem" | "keyExtractor">;

/**
 * A whole document, virtualized. The English Terms are about 12k words in
 * about 200 blocks (the French about 15k); drawing them all at once in a ScrollView costs a long
 * frozen frame on a mid-range phone as the modal opens. A FlatList over the
 * blocks draws the first screenful at once and the rest in small batches as
 * the reader scrolls, and each block stays one cheap row (a Text, a short
 * list or one table).
 */
export const LegalDocumentList = React.forwardRef<
  FlatList<LegalBlock>,
  { blocks: LegalBlock[]; lang?: LegalLang; onRef?: LegalRefHandler } & ListProps
>(function LegalDocumentList({ blocks, lang = "en", onRef, ...rest }, ref) {
  const renderItem = React.useCallback<ListRenderItem<LegalBlock>>(
    ({ item }) => (
      <View className="pb-3">
        <LegalBlockView block={item} lang={lang} />
      </View>
    ),
    [lang],
  );
  return (
    <RefContext.Provider value={onRef}>
      <FlatList
        ref={ref}
        data={blocks}
        renderItem={renderItem}
        keyExtractor={(_, i) => String(i)}
        initialNumToRender={16}
        maxToRenderPerBatch={16}
        windowSize={11}
        {...rest}
      />
    </RefContext.Provider>
  );
});
