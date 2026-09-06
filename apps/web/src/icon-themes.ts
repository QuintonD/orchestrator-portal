export const iconThemes = [
  { id: "symbols", name: "Futuristic", file: "/assets/assistants-symbols.png", icons: ["Orbit", "Radar", "Portal", "Circuit"] },
  { id: "animals", name: "Animals", file: "/assets/assistants-animals.png", icons: ["Owl", "Fox", "Cat", "Bird"] },
  { id: "geometry", name: "Geometry", file: "/assets/assistants-geometry.png", icons: ["Circles", "Diamonds", "Triangle", "Hexagons"] },
] as const;
export type IconTheme = typeof iconThemes[number]["id"];
export function validIconTheme(value: unknown): IconTheme {
  return iconThemes.some((theme) => theme.id === value) ? value as IconTheme : "symbols";
}
export function iconRow(identity: string): number {
  let hash = 2166136261;
  for (const letter of identity) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619);
  return (hash >>> 0) % 4;
}
