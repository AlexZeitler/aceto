import { getCommandModal } from "./highlight";

let modalOpen = false;
let resolvePromise: ((value: string | null) => void) | null = null;

interface CommandModalConfig {
  title: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
}

export function isCommandModalOpen(): boolean {
  return modalOpen;
}

export function closeCommandModal(): boolean {
  if (!modalOpen) return false;
  const backdrop = getCommandModal();
  if (backdrop) {
    backdrop.classList.remove("open");
    backdrop.innerHTML = "";
  }
  modalOpen = false;
  if (resolvePromise) {
    resolvePromise(null);
    resolvePromise = null;
  }
  return true;
}

export function openCommandModal(config: CommandModalConfig): Promise<string | null> {
  const backdrop = getCommandModal();
  if (!backdrop) return Promise.resolve(null);

  // Close any existing modal
  if (modalOpen) closeCommandModal();

  return new Promise((resolve) => {
    resolvePromise = resolve;
    modalOpen = true;

    // Build modal inner structure
    const modal = document.createElement("div");
    modal.className = "aceto-cmd-modal";

    const header = document.createElement("div");
    header.className = "aceto-cmd-header";
    header.textContent = config.title;
    modal.appendChild(header);

    const textarea = document.createElement("textarea");
    textarea.className = "aceto-cmd-textarea";
    if (config.placeholder) textarea.placeholder = config.placeholder;
    if (config.initialValue) textarea.value = config.initialValue;
    modal.appendChild(textarea);

    const footer = document.createElement("div");
    footer.className = "aceto-cmd-footer";

    const hint = document.createElement("span");
    hint.className = "aceto-cmd-hint";
    hint.textContent = "Ctrl+Enter to submit \u00B7 Escape to cancel";
    footer.appendChild(hint);

    const buttons = document.createElement("div");
    buttons.className = "aceto-cmd-buttons";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "aceto-cmd-btn";
    cancelBtn.textContent = "Cancel";
    buttons.appendChild(cancelBtn);

    const submitBtn = document.createElement("button");
    submitBtn.className = "aceto-cmd-btn aceto-cmd-btn-primary";
    submitBtn.textContent = config.submitLabel || "Insert";
    buttons.appendChild(submitBtn);

    footer.appendChild(buttons);
    modal.appendChild(footer);

    backdrop.innerHTML = "";
    backdrop.appendChild(modal);
    backdrop.classList.add("open");

    // Focus textarea
    setTimeout(() => textarea.focus(), 10);

    // Event handlers
    function submit() {
      const value = textarea.value;
      modalOpen = false;
      backdrop!.classList.remove("open");
      backdrop!.innerHTML = "";
      if (resolvePromise) {
        resolvePromise(value);
        resolvePromise = null;
      }
    }

    function cancel() {
      closeCommandModal();
    }

    textarea.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        submit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    });

    // Stop all events on modal from propagating to document
    modal.addEventListener("keydown", (e) => e.stopPropagation());
    modal.addEventListener("keyup", (e) => e.stopPropagation());
    modal.addEventListener("keypress", (e) => e.stopPropagation());
    modal.addEventListener("click", (e) => e.stopPropagation());
    modal.addEventListener("mousedown", (e) => e.stopPropagation());
    modal.addEventListener("mouseup", (e) => e.stopPropagation());

    cancelBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      cancel();
    });

    submitBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      submit();
    });

    // Backdrop click → cancel
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        e.stopPropagation();
        cancel();
      }
    });
  });
}
