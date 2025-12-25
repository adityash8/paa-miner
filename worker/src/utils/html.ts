import type { GeneratedAnswer } from '../types';

/**
 * Generate embeddable FAQ HTML with schema.org markup
 */
export function generateFAQHTML(answers: GeneratedAnswer[]): string {
  const items = answers
    .map(
      (qa) => `  <div class="paa-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
    <h3 class="paa-question" itemprop="name">${escapeHTML(qa.question)}</h3>
    <div class="paa-answer" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
      <div itemprop="text">
        ${qa.answer_html}
      </div>
    </div>
  </div>`
    )
    .join('\n');

  return `<div class="paa-faq-section" itemscope itemtype="https://schema.org/FAQPage">
${items}
</div>`;
}

/**
 * Generate FAQ schema JSON-LD script tag
 */
export function generateSchemaScript(answers: GeneratedAnswer[]): string {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: answers.map((a) => a.schema),
  };

  return `<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>`;
}

/**
 * Generate complete embed code (HTML + CSS + Schema)
 */
export function generateEmbedCode(answers: GeneratedAnswer[]): {
  html: string;
  schema: string;
  css: string;
  combined: string;
} {
  const html = generateFAQHTML(answers);
  const schema = generateSchemaScript(answers);
  const css = getDefaultCSS();

  const combined = `<!-- PAA Dominator FAQ Embed -->
<style>
${css}
</style>

${html}

${schema}`;

  return { html, schema, css, combined };
}

/**
 * Default CSS styles for FAQ section
 */
function getDefaultCSS(): string {
  return `.paa-faq-section {
  max-width: 800px;
  margin: 2rem auto;
  font-family: system-ui, -apple-system, sans-serif;
}

.paa-item {
  border-bottom: 1px solid #e5e7eb;
  padding: 1.5rem 0;
}

.paa-item:last-child {
  border-bottom: none;
}

.paa-question {
  font-size: 1.125rem;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 0.75rem 0;
  line-height: 1.4;
}

.paa-answer {
  color: #4b5563;
  line-height: 1.6;
}

.paa-answer p {
  margin: 0;
}

.paa-answer ol,
.paa-answer ul {
  margin: 0.5rem 0;
  padding-left: 1.5rem;
}

.paa-answer li {
  margin: 0.25rem 0;
}

.paa-answer table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.5rem 0;
}

.paa-answer th,
.paa-answer td {
  border: 1px solid #e5e7eb;
  padding: 0.5rem 0.75rem;
  text-align: left;
}

.paa-answer th {
  background: #f9fafb;
  font-weight: 600;
}`;
}

/**
 * Generate CSV content from PAA questions
 */
export function generateCSV(
  questions: Array<{
    question: string;
    type: string;
    parent?: string | null;
    position?: number;
  }>
): string {
  const headers = ['Question', 'Type', 'Parent Question', 'Position'];
  const rows = questions.map((q) => [
    escapeCSV(q.question),
    escapeCSV(q.type),
    escapeCSV(q.parent || ''),
    String(q.position ?? ''),
  ]);

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeCSV(text: string): string {
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Create a slug from a question
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
}
