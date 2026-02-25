import type { ScrollState } from "@features/sessions/stores/sessionViewStore";
import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { VList, type VListHandle } from "virtua";

interface VirtualizedListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  getItemKey?: (item: T, index: number) => string | number;
  className?: string;
  itemClassName?: string;
  footer?: ReactNode;
  savedState?: ScrollState;
  onSaveState?: (state: ScrollState) => void;
  onScrollStateChange?: (isAtBottom: boolean) => void;
}

export interface VirtualizedListHandle {
  scrollToBottom: () => void;
}

const AT_BOTTOM_THRESHOLD = 50;

function VirtualizedListInner<T>(
  {
    items,
    renderItem,
    getItemKey,
    className,
    itemClassName,
    footer,
    savedState,
    onSaveState,
    onScrollStateChange,
  }: VirtualizedListProps<T>,
  ref: React.ForwardedRef<VirtualizedListHandle>,
) {
  const listRef = useRef<VListHandle>(null);
  const isAtBottomRef = useRef(!savedState);
  const initRef = useRef({ savedState, itemCount: items.length });
  const onSaveStateRef = useRef(onSaveState);
  onSaveStateRef.current = onSaveState;
  const onScrollStateChangeRef = useRef(onScrollStateChange);
  onScrollStateChangeRef.current = onScrollStateChange;
  const itemCountRef = useRef(items.length);
  itemCountRef.current = items.length;

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom: () => {
        const handle = listRef.current;
        if (handle) {
          handle.scrollTo(handle.scrollSize);
          isAtBottomRef.current = true;
        }
      },
    }),
    [],
  );

  useLayoutEffect(() => {
    const handle = listRef.current;
    if (!handle) return;

    const { savedState: initialState, itemCount } = initRef.current;
    if (initialState) {
      handle.scrollTo(initialState.offset);
    } else if (itemCount > 0) {
      handle.scrollToIndex(itemCount - 1, { align: "end" });
    }

    return () => {
      onSaveStateRef.current?.({
        offset: handle.scrollOffset,
        cache: handle.cache,
      });
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-run when items change for streaming scroll
  useEffect(() => {
    if (isAtBottomRef.current) {
      const handle = listRef.current;
      if (handle) {
        // Use scrollToIndex for reliable positioning after measurements settle
        const totalChildren = itemCountRef.current + (footer ? 1 : 0);
        if (totalChildren > 0) {
          handle.scrollToIndex(totalChildren - 1, { align: "end" });
        }
      }
    }
  }, [items, footer]);

  const handleScroll = useCallback((offset: number) => {
    const handle = listRef.current;
    if (!handle) return;
    const distanceFromBottom = handle.scrollSize - offset - handle.viewportSize;
    const atBottom = distanceFromBottom < AT_BOTTOM_THRESHOLD;
    if (isAtBottomRef.current !== atBottom) {
      isAtBottomRef.current = atBottom;
    }
    onScrollStateChangeRef.current?.(atBottom);
  }, []);

  return (
    <div
      className={className}
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <VList
        ref={listRef}
        cache={savedState?.cache}
        shift={false}
        style={{ flex: 1 }}
        onScroll={handleScroll}
      >
        {items.map((item, index) => (
          <div
            key={getItemKey ? getItemKey(item, index) : index}
            className={itemClassName}
          >
            {renderItem(item, index)}
          </div>
        ))}
        {footer && <div className={itemClassName}>{footer}</div>}
      </VList>
    </div>
  );
}

export const VirtualizedList = forwardRef(VirtualizedListInner) as <T>(
  props: VirtualizedListProps<T> & {
    ref?: React.ForwardedRef<VirtualizedListHandle>;
  },
) => ReturnType<typeof VirtualizedListInner>;
