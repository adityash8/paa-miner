/**
 * Utility functions for formatting PAA results into various output formats
 */

/**
 * Convert PAA questions to FAQ JSON-LD schema for SEO
 */
export function toFAQJsonLD(rows: { question: string; answer?: string }[]): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': rows.map(r => ({
      '@type': 'Question',
      'name': r.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': r.answer || ''
      }
    }))
  };
}

/**
 * Format PAA questions as a GEO-optimized markdown block
 */
export function toGeoBlock(questions: string[]): string {
  return [
    '### People Also Ask',
    '',
    ...questions.map(q => `- ${q}`),
    ''
  ].join('\n');
}

/**
 * Convert results to CSV format
 */
export function toCSV(results: Array<{ question: string; depth: number; appearances: number; confidence: number }>): string {
  const header = 'Question,Depth,Appearances,Confidence';
  const rows = results.map(r =>
    `"${r.question.replace(/"/g, '""')}",${r.depth},${r.appearances},${r.confidence}`
  );
  return [header, ...rows].join('\n');
}
