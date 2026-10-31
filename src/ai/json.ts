/** Extracts the first balanced JSON object from model text (ignores prose / code fences). */
export function extractFirstJson(text: string): unknown {
  const start = text.indexOf('{');
  if (start < 0) throw new Error('В ответе нет JSON-объекта');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error('JSON-объект не закрыт');
}
