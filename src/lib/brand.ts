/** Presentation only: never change stored program content or conversation names. */
export function rebrandText(text: string): string {
  return text.replace(/Titan Strength Logger|Titan Log|\bNSS\b|\bTitan\b/g, "HustLevel");
}