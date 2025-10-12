'use client';

import { useState } from 'react';

export default function HomePage() {
  const [keyword, setKeyword] = useState('');
  const [gl, setGl] = useState('US');
  const [hl, setHl] = useState('en');
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [depth, setDepth] = useState(2);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [geoBlock, setGeoBlock] = useState('');
  const [jsonLd, setJsonLd] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;
    setLoading(true);
    setError('');
    setResults([]);
    setGeoBlock('');
    setJsonLd('');

    try {
      const res = await fetch('/api/paa', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          keyword,
          gl,
          hl,
          device,
          depth,
          k: 2,
          strict: true,
          returnEvidence: false
        })
      });

      const data = await res.json();

      if (res.ok) {
        setResults(data.results);
        const qs = data.results.map((r: any) => r.question);
        setGeoBlock(['### people also ask', '', ...qs.map((q: string) => `- ${q}`)].join('\n'));

        const faq = {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          'mainEntity': qs.slice(0, 8).map((q: string) => ({
            '@type': 'Question',
            'name': q,
            'acceptedAnswer': { '@type': 'Answer', 'text': '' }
          }))
        };
        setJsonLd(JSON.stringify(faq, null, 2));
      } else {
        setError(data.error || 'Failed to fetch PAAs');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    }

    setLoading(false);
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold mb-6">🧠 PAA Miner</h1>
      <p className="mb-4 text-gray-600">
        Enter a keyword and pick a country. The tool fetches <em>People Also Ask</em> questions directly
        from live Google SERPs for accurate GEO optimization.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3 mb-8">
        <input
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="Target keyword (e.g., best noise cancelling headphones)"
          className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Country (gl)</label>
            <input
              value={gl}
              onChange={e => setGl(e.target.value.toUpperCase())}
              className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={2}
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">Language (hl)</label>
            <input
              value={hl}
              onChange={e => setHl(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">Device</label>
            <select
              value={device}
              onChange={e => setDevice(e.target.value as any)}
              className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            >
              <option value="mobile">Mobile</option>
              <option value="desktop">Desktop</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-500 mb-1">Depth</label>
            <input
              type="number"
              value={depth}
              onChange={e => setDepth(parseInt(e.target.value))}
              min={1}
              max={3}
              className="w-full border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !keyword.trim()}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Fetching PAAs...' : 'Get PAAs'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          <strong>Error:</strong> {error}
        </div>
      )}

      {results.length > 0 && (
        <div>
          <h2 className="text-2xl font-semibold mb-2">Top Questions</h2>
          <p className="text-sm text-gray-500 mb-3">
            {results.length} questions found · click below to copy
          </p>

          <div className="space-y-2 mb-8 max-h-96 overflow-y-auto">
            {results.slice(0, 50).map((r, i) => (
              <div
                key={i}
                className="bg-white border border-gray-200 rounded px-3 py-2 shadow-sm hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium">{r.question}</span>
                <span className="text-xs text-gray-400 ml-2">
                  ({Math.round(r.confidence * 100)}% confidence, depth: {r.depth})
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2 flex items-center justify-between">
                <span>📦 GEO Block (Markdown)</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(geoBlock);
                    alert('GEO Block copied to clipboard!');
                  }}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Copy to Clipboard
                </button>
              </h3>
              <textarea
                value={geoBlock}
                readOnly
                rows={10}
                className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-sm bg-gray-50 focus:outline-none"
              />
            </div>

            <div>
              <h3 className="font-semibold mb-2 flex items-center justify-between">
                <span>💬 FAQ JSON-LD Schema</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(jsonLd);
                    alert('FAQ JSON-LD copied to clipboard!');
                  }}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Copy to Clipboard
                </button>
              </h3>
              <textarea
                value={jsonLd}
                readOnly
                rows={12}
                className="w-full border border-gray-300 rounded px-3 py-2 font-mono text-xs bg-gray-50 focus:outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                Add your own answers to the <code>text</code> field before using
              </p>
            </div>
          </div>
        </div>
      )}

      {!loading && results.length === 0 && !error && (
        <div className="text-center text-gray-500 py-8">
          Enter a keyword and click "Get PAAs" to start mining questions
        </div>
      )}
    </div>
  );
}
