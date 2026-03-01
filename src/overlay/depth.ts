import { setSelectedElement, getSelectedElement } from "./selector";

let depthStack: Element[] = [];

export function initDepthNavigation(startElement: Element) {
  depthStack = [startElement];
}

export function clearDepthNavigation() {
  depthStack = [];
}

function findFirstChildElement(el: Element): Element | null {
  for (const child of Array.from(el.children)) {
    if (child.tagName && child.id !== "__aceto_host__") {
      return child;
    }
  }
  return null;
}

function isOverSelected(e: WheelEvent, selected: Element): boolean {
  const rect = selected.getBoundingClientRect();
  return (
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom
  );
}

function handleWheel(e: WheelEvent) {
  const selected = getSelectedElement();
  if (!selected) return;

  // Only intercept when cursor is over the selected element
  if (!isOverSelected(e, selected)) return;

  e.preventDefault();
  e.stopPropagation();

  if (e.deltaY < 0) {
    // Scroll up → go to parent
    const parent = selected.parentElement;
    if (parent && parent !== document.documentElement && parent !== document.body) {
      depthStack.push(selected);
      setSelectedElement(parent);
    }
  } else if (e.deltaY > 0) {
    // Scroll down → go back to child
    if (depthStack.length > 0) {
      const child = depthStack.pop()!;
      // Verify child still exists in DOM
      if (document.contains(child)) {
        setSelectedElement(child);
      }
    } else {
      // Try to go to first child element
      const child = findFirstChildElement(selected);
      if (child) {
        depthStack = [];
        setSelectedElement(child);
      }
    }
  }
}

document.addEventListener("wheel", handleWheel, { passive: false, capture: true });
