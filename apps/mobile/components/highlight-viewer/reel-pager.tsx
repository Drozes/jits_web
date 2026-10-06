import * as React from "react";
import { FlatList, Platform, View, type LayoutChangeEvent } from "react-native";
import { StatusBar } from "expo-status-bar";
import { darkTokens } from "@/lib/tokens";
import { ForceDarkTheme } from "@/lib/theme/force-dark-theme";
import type { ReelItem } from "@/lib/highlight/reel-types";
import type { ReelViewerSession } from "@/lib/highlight/reel-viewer-session";
import { pageLayout } from "@/lib/highlight/reel-pager-math";
import { REEL_VIEWABILITY, useReelPager } from "./use-reel-pager";
import { ReelLoadingPage, ReelPagerPage } from "./reel-pager-page";
import { ViewerHeader } from "./viewer-header";
import { useViewerClose } from "./use-viewer-close";

const keyOf = (item: ReelItem) => item.highlightId;

/**
 * The shorts-style swipe viewer (spec 8.3): a vertical, paging FlatList of
 * full-screen pages, one per lane reel; one page per fling, a 3-page window,
 * fixed layout for `initialScrollIndex`. A swipe never closes; Close and
 * system back do; an open sheet suspends paging.
 */
export function ReelPager({ session }: { session: ReelViewerSession }) {
  const close = useViewerClose();
  const [height, setHeight] = React.useState(0);
  const p = useReelPager(session, height);
  const onLayout = React.useCallback((e: LayoutChangeEvent) => setHeight(Math.round(e.nativeEvent.layout.height)), []);
  const getItemLayout = React.useCallback((_: unknown, index: number) => pageLayout(height, index), [height]);
  const last = p.items.length - 1;
  const renderItem = ({ item, index }: { item: ReelItem; index: number }) => (
    <ReelPagerPage
      item={item}
      index={index}
      height={height}
      active={index === p.active}
      swiped={p.wasSwiped(index)}
      showHint={p.hintVisible && index === p.active}
      caughtUp={p.caughtUp && index === last}
      source={p.source}
      pool={p.pool}
      firstOpen={p.firstOpen}
      onModalChange={p.onModalChange}
      onClose={close}
    />
  );
  return (
    <ForceDarkTheme style={{ backgroundColor: darkTokens.bgPrimary }}>
      <StatusBar style="light" />
      <View testID="reel-pager" className="flex-1" onLayout={onLayout}>
        {height > 0 ? (
          <FlatList
            testID="reel-pager-list"
            data={p.items}
            keyExtractor={keyOf}
            renderItem={renderItem}
            extraData={`${p.active}:${p.hintVisible}:${p.caughtUp}`}
            ListFooterComponent={p.loadingMore ? <ReelLoadingPage height={height} /> : null}
            pagingEnabled
            decelerationRate="fast"
            snapToAlignment="start"
            disableIntervalMomentum
            showsVerticalScrollIndicator={false}
            initialScrollIndex={session.startIndex}
            getItemLayout={getItemLayout}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            windowSize={3}
            removeClippedSubviews={Platform.OS === "android"}
            onMomentumScrollEnd={p.onMomentumScrollEnd}
            onScrollEndDrag={p.onScrollEndDrag}
            onViewableItemsChanged={p.onViewableItemsChanged}
            viewabilityConfig={REEL_VIEWABILITY}
            scrollEnabled={!p.modalOpen}
          />
        ) : null}
        <ViewerHeader onClose={close} />
      </View>
    </ForceDarkTheme>
  );
}
