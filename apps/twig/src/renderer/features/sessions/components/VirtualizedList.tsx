import type { ScrollState } from "@features/sessions/stores/sessionViewStore";
import {
  forwardRef,
  type ReactNode,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
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
  const [isAtBottom, setIsAtBottom] = useState(!savedState);
  const isAtBottomRef = useRef(!savedState);
  const initRef = useRef({ savedState, itemCount: items.length });
  const onSaveStateRef = useRef(onSaveState);
  onSaveStateRef.current = onSaveState;

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom: () => {
        const handle = listRef.current;
        if (handle) {
          handle.scrollTo(handle.scrollSize);
          isAtBottomRef.current = true;
          setIsAtBottom(true);
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
        handle.scrollTo(handle.scrollSize);
      }
    }
  }, [items]);

  const handleScroll = (offset: number) => {
    const handle = listRef.current;
    if (!handle) return;
    const distanceFromBottom = handle.scrollSize - offset - handle.viewportSize;
    const atBottom = distanceFromBottom < AT_BOTTOM_THRESHOLD;
    if (isAtBottomRef.current !== atBottom) {
      isAtBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
    }
    onScrollStateChange?.(atBottom);
  };

  return (
    <div
      className={className}
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <VList
        ref={listRef}
        cache={savedState?.cache}
        shift={!isAtBottom}
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
