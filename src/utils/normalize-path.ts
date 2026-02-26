export function normalizePath(path: string): string {
  return path.replace(/^\//, "").replace(/\//g, ":");
}
