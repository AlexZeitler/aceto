declare module "idiomorph" {
  interface MorphOptions {
    morphStyle?: "innerHTML" | "outerHTML";
    ignoreActive?: boolean;
    ignoreActiveValue?: boolean;
    head?: { style?: string };
  }

  export const Idiomorph: {
    morph(
      oldNode: Element,
      newContent: string | Element,
      options?: MorphOptions,
    ): void;
  };
}
