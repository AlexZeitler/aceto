import { existsSync, readFileSync } from "fs";
import path from "path";

export interface ElementDefaults {
  checkbox?: string;
  img?: string;
}

export function loadDefaults(projectDir: string): ElementDefaults {
  const file = path.join(projectDir, "aceto.defaults.json");
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}
