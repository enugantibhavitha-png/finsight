const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&#160;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#8217;": "'",
  "&#8220;": '"',
  "&#8221;": '"',
  "&#8212;": "—",
};

/** Convert an SEC filing's HTML into readable plain text. */
export function htmlToText(html: string): string {
  let text = html
    .replace(/<ix:header[\s\S]*?<\/ix:header>/gi, " ") // inline XBRL metadata
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  for (const [entity, char] of Object.entries(ENTITIES)) text = text.split(entity).join(char);
  text = text.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}
