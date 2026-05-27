const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_KEY ?? '';

/**
 * Asks Claude to estimate expiration dates for a list of grocery items,
 * counted from today. Returns a parallel array of YYYY-MM-DD strings.
 * If an item can't be estimated (e.g. shelf-stable, unknown), the entry
 * will be an empty string.
 */
export async function estimateExpirations(names: string[]): Promise<string[]> {
  if (!names.length || !ANTHROPIC_KEY) return names.map(() => '');

  const today = new Date().toISOString().slice(0, 10);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Today's date is ${today}. For each grocery item below, estimate a reasonable expiration date assuming it was purchased today and stored properly (refrigerated if perishable, pantry if shelf-stable). Use typical home storage shelf life — not the absolute maximum.\n\nItems:\n${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}\n\nReturn ONLY a valid JSON array of strings in YYYY-MM-DD format, in the same order as the input. For shelf-stable items with very long shelf life (>1 year) or items you can't estimate, use an empty string "". Example for input ["Whole Milk","Salt","Bananas"]: ["${addDays(today, 7)}","","${addDays(today, 5)}"]`,
        }],
      }),
    });

    if (!response.ok) return names.map(() => '');

    const data = await response.json();
    const text: string = data.content[0].text.trim();
    const jsonText = text.startsWith('[') ? text : text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
    const dates: string[] = JSON.parse(jsonText);

    if (!Array.isArray(dates) || dates.length !== names.length) return names.map(() => '');
    return dates.map(d => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''));
  } catch {
    return names.map(() => '');
  }
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
