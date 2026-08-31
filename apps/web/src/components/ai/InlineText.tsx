// Small inline-only formatter for text/cell strings inside a ResponseBlock:
// **bold**, `code`, and [text](url) links. Deliberately not a markdown
// library — blocks are already structured, so the only markdown left to
// handle is inline emphasis/links within a single string.
const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

export function InlineText({ text }: { text: string }) {
  const parts = text.split(INLINE_PATTERN).filter((part) => part.length > 0);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={i} className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em]">
              {part.slice(1, -1)}
            </code>
          );
        }
        const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (linkMatch) {
          return (
            <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-violet-600 underline underline-offset-2 hover:text-violet-700">
              {linkMatch[1]}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
