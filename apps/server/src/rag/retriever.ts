/**
 * Minimal retrieval over the policy note: one chunk per "## " section, scored
 * with BM25 over stemmed keywords. With 5 short chunks this is enough to show
 * the RAG pattern (retrieve -> ground -> cite) without a vector store.
 * Swapping in pgvector later only changes this file.
 */
export interface PolicyChunk {
  id: string;
  title: string;
  text: string;
}

export interface ScoredChunk extends PolicyChunk {
  score: number;
}

const STOPWORDS = new Set(
  "a an and are as at be by can do does for from how i if in is it its me my of on or should so that the their them then there these this to was what when where which who why will with you your any must not no we our has have".split(
    " ",
  ),
);

/** Lowercase, strip punctuation, drop stopwords, crude suffix stemming. */
export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

function stem(t: string): string {
  for (const suffix of ["ations", "ation", "ings", "ing", "ers", "ed", "es", "s"]) {
    if (t.length > suffix.length + 3 && t.endsWith(suffix)) return t.slice(0, -suffix.length);
  }
  return t;
}

export function chunkPolicy(markdown: string): PolicyChunk[] {
  return markdown
    .split(/^## /m)
    .slice(1)
    .map((section) => {
      const [heading = "", ...body] = section.split("\n");
      const match = /^(P\d+)\s+(.*)$/.exec(heading.trim());
      return {
        id: match?.[1] ?? heading.trim(),
        title: match?.[2]?.trim() ?? heading.trim(),
        text: body.join("\n").trim(),
      };
    });
}

export interface Retriever {
  chunks: PolicyChunk[];
  retrieve(query: string, k?: number): ScoredChunk[];
}

export function createRetriever(markdown: string, minScore = 1.0): Retriever {
  const chunks = chunkPolicy(markdown);
  const docs = chunks.map((c) => tokenize(`${c.title} ${c.title} ${c.text}`));
  const avgLen = docs.reduce((n, d) => n + d.length, 0) / Math.max(docs.length, 1);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);

  const K1 = 1.2;
  const B = 0.75;
  const idf = (t: string) => {
    const n = df.get(t) ?? 0;
    return Math.log(1 + (chunks.length - n + 0.5) / (n + 0.5));
  };

  return {
    chunks,
    retrieve(query, k = 3) {
      const terms = [...new Set(tokenize(query))];
      if (terms.length === 0) return [];
      return chunks
        .map((chunk, i) => {
          const doc = docs[i] ?? [];
          let score = 0;
          for (const t of terms) {
            const tf = doc.filter((x) => x === t).length;
            if (tf === 0) continue;
            score += idf(t) * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * doc.length) / avgLen)));
          }
          return { ...chunk, score };
        })
        .filter((c) => c.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    },
  };
}
