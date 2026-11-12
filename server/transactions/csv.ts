export function parseCsv(text: string) {
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = 0;
  let line = 1;
  let start = 1;
  const end = () => {
    cells.push(cell);
    cell = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const newline = ch === "\n" || (ch === "\r" && text[i + 1] !== "\n");
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = 0;
    } else if (ch === '"') quoted = line;
    else if (ch === ",") end();
    else if (ch !== "\r" && ch !== "\n") cell += ch;
    if (newline && !quoted) {
      end();
      rows.push({ line: start, cells });
      cells = [];
      start = line + 1;
    }
    if (newline) line++;
  }
  if (quoted) return { error: `Line ${quoted} opens a quote that is never closed` };
  if (cell || cells.length) {
    end();
    rows.push({ line: start, cells });
  }
  return { rows };
}
