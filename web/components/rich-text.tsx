const emphasis = /(\*\*[^*\s](?:[^*\n]*[^*\s])?\*\*|\*[^*\s](?:[^*\n]*[^*\s])?\*)/;

export function RichText({ text }: { text: string }) {
  return text.split(emphasis).map((part, i) => {
    if (i % 2 === 0) return part;
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return <em key={i}>{part.slice(1, -1)}</em>;
  });
}
