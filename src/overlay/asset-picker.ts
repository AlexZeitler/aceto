import { send, on } from "./ws-client";
import { getAssetModal } from "./highlight";

let isOpen = false;

function render(assets: Array<{ path: string; name: string }>) {
  const modal = getAssetModal();
  if (!modal) return;

  modal.innerHTML = "";

  const dialog = document.createElement("div");
  dialog.className = "aceto-asset-modal";

  // Header
  const header = document.createElement("div");
  header.className = "aceto-asset-header";
  const title = document.createElement("span");
  title.textContent = `Assets (${assets.length})`;
  header.appendChild(title);
  const closeBtn = document.createElement("button");
  closeBtn.className = "aceto-asset-close";
  closeBtn.textContent = "\u00D7";
  closeBtn.addEventListener("mousedown", (e) => e.preventDefault());
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    close();
  });
  header.appendChild(closeBtn);
  dialog.appendChild(header);

  if (assets.length === 0) {
    const empty = document.createElement("div");
    empty.className = "aceto-asset-empty";
    empty.textContent = "No assets found in assets/ folder";
    dialog.appendChild(empty);
  } else {
    // Grid
    const grid = document.createElement("div");
    grid.className = "aceto-asset-grid";

    for (const asset of assets) {
      const item = document.createElement("div");
      item.className = "aceto-asset-item";

      const thumb = document.createElement("img");
      thumb.className = "aceto-asset-thumb";
      thumb.src = asset.path;
      thumb.alt = asset.name;
      thumb.loading = "lazy";
      item.appendChild(thumb);

      const name = document.createElement("div");
      name.className = "aceto-asset-name";
      name.textContent = asset.name;
      name.title = asset.name;
      item.appendChild(name);

      item.addEventListener("mousedown", (e) => e.preventDefault());
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        send({ type: "pick_asset", path: asset.path });
        close();
      });

      grid.appendChild(item);
    }

    dialog.appendChild(grid);
  }

  modal.appendChild(dialog);

  // Click backdrop to close
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      close();
    }
  });
}

export function open() {
  if (isOpen) return;
  isOpen = true;
  send({ type: "list_assets" });
}

export function close() {
  const modal = getAssetModal();
  if (modal) {
    modal.classList.remove("open");
  }
  isOpen = false;
}

export function isAssetPickerOpen(): boolean {
  return isOpen;
}

// Listen for asset list from server
on("assets_list", (data) => {
  const modal = getAssetModal();
  if (!modal || !isOpen) return;
  render(data.assets);
  modal.classList.add("open");
});
