export interface CommandContext {
  mode: "create" | "edit";
  element: Element;
  selector: string;
  fallbackSelector: string;
  existingData?: any;
}

export interface Command {
  name: string;
  editSelector?: string;
  extractData?: (el: Element) => any;
  handler: (ctx: CommandContext) => Promise<string | null>;
}

const commands = new Map<string, Command>();

export function registerCommand(cmd: Command) {
  commands.set(cmd.name, cmd);
}

export function getCommand(name: string): Command | undefined {
  return commands.get(name);
}

export function getCommandForElement(el: Element): Command | undefined {
  for (const cmd of commands.values()) {
    if (cmd.editSelector && el.matches(cmd.editSelector)) {
      return cmd;
    }
  }
  return undefined;
}
