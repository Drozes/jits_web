import * as React from "react";
import type { FlatList } from "react-native";

/** How many times a jump to a row not measured yet is retried. */
export const MAX_JUMP_RETRIES = 5;

type FailInfo = { index: number; averageItemLength: number };

/**
 * Jumps a FlatList of variable-height rows to a row (the legal modal's
 * Contents, references and `?section=`; jits-rog5.10).
 *
 * `scrollToIndex` fails for a row the list has not measured yet. Then it
 * scrolls near the row by the average row height and retries after 50 ms, at
 * most MAX_JUMP_RETRIES times. Only the latest jump is retried: a newer jump,
 * a change of `resetKey` (document or language) or unmount cancels the
 * pending retry, and a failure reported for any other row is ignored.
 */
export function useListJump<T>(listRef: React.RefObject<FlatList<T> | null>, resetKey: string) {
  const target = React.useRef<number | null>(null);
  const retries = React.useRef(0);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  React.useEffect(() => {
    cancel();
    target.current = null;
    return cancel;
  }, [resetKey, cancel]);

  const jumpTo = React.useCallback(
    (index: number) => {
      cancel();
      target.current = index;
      retries.current = 0;
      listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0 });
    },
    [listRef, cancel],
  );

  const onScrollToIndexFailed = React.useCallback(
    (info: FailInfo) => {
      if (info.index !== target.current || retries.current >= MAX_JUMP_RETRIES) return;
      retries.current += 1;
      listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
      cancel();
      timer.current = setTimeout(() => {
        timer.current = null;
        if (target.current === info.index) listRef.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0 });
      }, 50);
    },
    [listRef, cancel],
  );

  return { jumpTo, onScrollToIndexFailed };
}
