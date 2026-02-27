// Lightweight cn() — replaces clsx + tailwind-merge to eliminate those packages.
// Handles strings, undefined, null, false, and arrays.
type ClassInput = string | undefined | null | false | ClassInput[];

function flatten(inputs: ClassInput[]): string[] {
  const result: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === 'string') {
      result.push(input);
    } else if (Array.isArray(input)) {
      result.push(...flatten(input));
    }
  }
  return result;
}

export function cn(...inputs: ClassInput[]): string {
  return flatten(inputs).join(' ');
}
