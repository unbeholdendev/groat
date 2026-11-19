const emphasis = /(\*\*[^*\s](?:[^*\n]*[^*\s])?\*\*|\*[^*\s](?:[^*\n]*[^*\s])?\*)/;
const link = /\[([^\]\n]+)\]\((\/(?:\?[^\s)\\]*)?)\)/;

type Linking = { onLink?: (href: string) => void };

function Links({ text, onLink }: { text: string } & Linking) {
  const parts = text.split(link);
  return parts.map((part, i) => {
    if (i % 3 === 0) return part;
    if (i % 3 === 2) return null;
    const href = parts[i + 1];
    return (
      <a
        key={i}
        href={href}
        className="text-accent underline"
        onClick={(e) => {
          if (!onLink) return;
          e.preventDefault();
          onLink(href);
        }}
      >
        {part}
      </a>
    );
  });
}

export function RichText({ text, onLink }: { text: string } & Linking) {
  return text.split(emphasis).map((part, i) => {
    if (i % 2 === 0) return <Links key={i} text={part} onLink={onLink} />;
    if (part.startsWith("**"))
      return (
        <strong key={i}>
          <Links text={part.slice(2, -2)} onLink={onLink} />
        </strong>
      );
    return (
      <em key={i}>
        <Links text={part.slice(1, -1)} onLink={onLink} />
      </em>
    );
  });
}
