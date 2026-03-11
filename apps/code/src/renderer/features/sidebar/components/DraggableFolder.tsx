import { useSortable } from "@dnd-kit/react/sortable";
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

interface DraggableFolderProps {
  id: string;
  index: number;
  children: ReactNode;
}

export function DraggableFolder({ id, index, children }: DraggableFolderProps) {
  const { ref, handleRef, isDragging } = useSortable({
    id,
    index,
    group: "sidebar-folders",
    transition: {
      duration: 200,
      easing: "ease",
    },
  });

  return (
    <div
      ref={ref}
      style={{
        opacity: isDragging ? 0.5 : 1,
        cursor: isDragging ? "grabbing" : undefined,
      }}
    >
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{
              dragHandleRef?: (el: Element | null) => void;
            }>,
            {
              dragHandleRef: handleRef,
            },
          )
        : children}
    </div>
  );
}
