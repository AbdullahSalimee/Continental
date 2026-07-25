// Cheap, deterministic "find the real website domain for this project"
// step. Runs BEFORE any AI call — most of the time the domain is already
// sitting in plain text somewhere (GitHub repo description, a project's own
// name) and doesn't need a model at all.
//
// Order of attempts:
//   1. A URL/bare-domain pattern inside the free-text description.
//   2. A URL/bare-domain pattern inside the project name itself.
//   3. Give up -> caller falls back to "unassigned".

const URL_PATTERN = /\bhttps?:\/\/([a-z0-9-]+\.)+[a-z]{2,}\b[^\s,;)]*/i;
const BARE_DOMAIN_PATTERN =
  /\b([a-z0-9-]+\.)+(com|net|org|io|co|dev|app|xyz|ai)\b/i;

export function extractDomainUrl(...texts: (string | undefined)[]): string | null {
  for (const text of texts) {
    if (!text) continue;
    const urlMatch = text.match(URL_PATTERN);
    if (urlMatch) return urlMatch[0];
    const bareMatch = text.match(BARE_DOMAIN_PATTERN);
    if (bareMatch) return bareMatch[0];
  }
  return null;
}
