import { type DragEvent, useState } from "react";

/**
 * Dragging a Link onto a Group. The browser's own drag and drop: it needs a mouse, so on a phone
 * the Link's "Move to a Group" action does the same.
 */

/** What a dragged Link carries: its Link Code, under a type nothing else on the page uses. */
const LINK_DRAG_TYPE = "application/x-linkstead-code";

const carriesLink = (event: DragEvent): boolean => event.dataTransfer.types.includes(LINK_DRAG_TYPE);

/** Starts dragging a Link, showing `preview` - the whole row - under the pointer. */
const startLinkDrag = (event: DragEvent, code: string, preview?: Element | null) => {
  event.dataTransfer.setData(LINK_DRAG_TYPE, code);
  event.dataTransfer.effectAllowed = "move";
  if (preview) {
    event.dataTransfer.setDragImage(preview, 24, 24);
  }
};

/**
 * Makes something a place a Link can be dropped on. `over` says when one is held above it, so it
 * can show that it will take it.
 */
const useLinkDrop = (onDrop: (code: string) => void) => {
  const [over, setOver] = useState(false);
  return {
    dropProps: {
      onDragEnter: (event: DragEvent) => {
        if (carriesLink(event)) {
          setOver(true);
        }
      },
      onDragLeave: (event: DragEvent) => {
        // Leaving for one of its own children is not leaving.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOver(false);
        }
      },
      onDragOver: (event: DragEvent) => {
        if (carriesLink(event)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      },
      onDrop: (event: DragEvent) => {
        setOver(false);
        const code = event.dataTransfer.getData(LINK_DRAG_TYPE);
        if (code) {
          event.preventDefault();
          onDrop(code);
        }
      }
    },
    over
  };
};

export { LINK_DRAG_TYPE, startLinkDrag, useLinkDrop };
