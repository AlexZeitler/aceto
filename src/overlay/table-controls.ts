import { send } from "./ws-client";
import { getTableToolbar } from "./highlight";

interface TableContext {
  table: HTMLTableElement;
  row: HTMLTableRowElement | null;
  cell: HTMLTableCellElement | null;
  colIndex: number;
}

function findTableContext(el: Element): TableContext | null {
  let current: Element | null = el;
  let cell: HTMLTableCellElement | null = null;
  let row: HTMLTableRowElement | null = null;
  let table: HTMLTableElement | null = null;

  while (current) {
    const tag = current.tagName.toLowerCase();
    if ((tag === "td" || tag === "th") && !cell) {
      cell = current as HTMLTableCellElement;
    }
    if (tag === "tr" && !row) {
      row = current as HTMLTableRowElement;
    }
    if (tag === "table") {
      table = current as HTMLTableElement;
      break;
    }
    current = current.parentElement;
  }

  if (!table) return null;
  const colIndex = cell ? cell.cellIndex : -1;
  return { table, row, cell, colIndex };
}

function getTableSelector(table: HTMLTableElement): string {
  const mid = table.getAttribute("data-mid");
  if (mid) return `[data-mid="${mid}"]`;
  if (table.id) return `#${CSS.escape(table.id)}`;

  // Build a structural selector
  const parts: string[] = [];
  let current: Element | null = table;
  while (current && current !== document.documentElement && current !== document.body) {
    let sel = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }
    const parent = current.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter(
        (c) => c.tagName === current!.tagName,
      );
      if (sameTag.length > 1) {
        const index = sameTag.indexOf(current) + 1;
        sel += `:nth-of-type(${index})`;
      }
    }
    parts.unshift(sel);
    current = current.parentElement;
  }
  return parts.join(" > ");
}

function getRowSelector(row: HTMLTableRowElement): string {
  const mid = row.getAttribute("data-mid");
  if (mid) return `[data-mid="${mid}"]`;

  // Use table selector + tr:nth-of-type
  const table = row.closest("table");
  if (!table) return "";
  const tableSelector = getTableSelector(table);
  const allRows = Array.from(table.querySelectorAll("tr"));
  const idx = allRows.indexOf(row) + 1;
  return `${tableSelector} tr:nth-of-type(${idx})`;
}

function countRows(table: HTMLTableElement): number {
  return table.querySelectorAll("tr").length;
}

function countCols(table: HTMLTableElement): number {
  const firstRow = table.querySelector("tr");
  if (!firstRow) return 0;
  return firstRow.querySelectorAll("td, th").length;
}

let currentContext: TableContext | null = null;
let repositionHandler: (() => void) | null = null;

function positionToolbar(table: HTMLTableElement) {
  const toolbar = getTableToolbar();
  if (!toolbar) return;

  const rect = table.getBoundingClientRect();
  const toolbarHeight = 28;
  let top = rect.top - toolbarHeight - 4;
  if (top < 0) top = rect.bottom + 4;

  toolbar.style.left = rect.left + "px";
  toolbar.style.top = top + "px";
}

function renderToolbar(ctx: TableContext) {
  const toolbar = getTableToolbar();
  if (!toolbar) return;

  const rowCount = countRows(ctx.table);
  const colCount = countCols(ctx.table);

  toolbar.innerHTML = "";

  const addRowBtn = document.createElement("button");
  addRowBtn.className = "aceto-table-btn";
  addRowBtn.textContent = "+Row";
  addRowBtn.title = "Add row";
  addRowBtn.addEventListener("mousedown", (e) => e.preventDefault());
  addRowBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    send({
      type: "table_op",
      action: "add-row",
      tableSelector: getTableSelector(ctx.table),
    });
  });

  const removeRowBtn = document.createElement("button");
  removeRowBtn.className = "aceto-table-btn";
  removeRowBtn.textContent = "\u2212Row";
  removeRowBtn.title = "Remove selected row";
  removeRowBtn.disabled = rowCount <= 1 || !ctx.row;
  removeRowBtn.addEventListener("mousedown", (e) => e.preventDefault());
  removeRowBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!ctx.row) return;
    send({
      type: "table_op",
      action: "remove-row",
      tableSelector: getTableSelector(ctx.table),
      rowSelector: getRowSelector(ctx.row),
    });
  });

  const sep = document.createElement("div");
  sep.className = "aceto-table-sep";

  const addColBtn = document.createElement("button");
  addColBtn.className = "aceto-table-btn";
  addColBtn.textContent = "+Col";
  addColBtn.title = "Add column";
  addColBtn.addEventListener("mousedown", (e) => e.preventDefault());
  addColBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    send({
      type: "table_op",
      action: "add-col",
      tableSelector: getTableSelector(ctx.table),
    });
  });

  const removeColBtn = document.createElement("button");
  removeColBtn.className = "aceto-table-btn";
  removeColBtn.textContent = "\u2212Col";
  removeColBtn.title = "Remove selected column";
  removeColBtn.disabled = colCount <= 1 || ctx.colIndex < 0;
  removeColBtn.addEventListener("mousedown", (e) => e.preventDefault());
  removeColBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    send({
      type: "table_op",
      action: "remove-col",
      tableSelector: getTableSelector(ctx.table),
      colIndex: ctx.colIndex,
    });
  });

  toolbar.appendChild(addRowBtn);
  toolbar.appendChild(removeRowBtn);
  toolbar.appendChild(sep);
  toolbar.appendChild(addColBtn);
  toolbar.appendChild(removeColBtn);

  toolbar.classList.add("visible");
  positionToolbar(ctx.table);
}

export function updateTableControls(el: Element | null) {
  if (!el) {
    hideTableControls();
    return;
  }

  const ctx = findTableContext(el);
  if (!ctx) {
    hideTableControls();
    return;
  }

  currentContext = ctx;
  renderToolbar(ctx);

  // Set up reposition listener
  if (!repositionHandler) {
    repositionHandler = () => {
      if (currentContext) {
        positionToolbar(currentContext.table);
      }
    };
    document.addEventListener("scroll", repositionHandler, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", repositionHandler);
  }
}

export function hideTableControls() {
  const toolbar = getTableToolbar();
  if (toolbar) {
    toolbar.classList.remove("visible");
  }
  currentContext = null;
}

export function refreshTableControlsAfterMorph() {
  // After morph the DOM elements are potentially replaced,
  // so we hide the toolbar. The next selection will re-show it.
  hideTableControls();
}
