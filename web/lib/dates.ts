export const today = () => new Date().toLocaleDateString("en-CA");

export function dayLabel(date: string) {
  const diff = Math.round((Date.parse(today()) - Date.parse(date)) / 864e5);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const d = new Date(`${date}T00:00`);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== new Date().getFullYear() && { year: "numeric" }),
  });
}

export const dated = /^\d{4}-\d{2}-\d{2}$/;
export function pick<K extends string>(search: Record<string, unknown>, rules: Record<K, RegExp>) {
  const valid: Partial<Record<K, string>> = {};
  for (const k in rules) {
    const v = search[k];
    if (typeof v === "string" && rules[k].test(v)) valid[k] = v;
  }
  return valid;
}
