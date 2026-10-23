function flatten(strings, values) {
  if (Array.isArray(strings)) {
    return strings.reduce((acc, s, i) => acc + s + (i < values.length ? String(values[i] ?? "") : ""), "");
  }
  return String(strings ?? "");
}

function dedent(strings, ...values) {
  const raw = flatten(strings, values);
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  if (lines.length === 1) return lines[0];
  const indents = lines
    .slice(1)
    .filter((l) => l.trim())
    .map((l) => l.match(/^[ \t]*/)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return [lines[0], ...lines.slice(1).map((l) => l.slice(min))].join("\n").replace(/^\n+|\n+$/g, "");
}

dedent.withOptions = () => dedent;
dedent.default = dedent;

export default dedent;
export { dedent };
