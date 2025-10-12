/**
 * Example test script for PAA Miner
 * Run with: node scripts/test-example.js
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testPAAMiner() {
  console.log('🔍 Testing PAA Miner...\n');

  const testCases = [
    {
      name: 'US English - Mobile',
      body: {
        keyword: 'best noise cancelling headphones',
        gl: 'US',
        hl: 'en',
        device: 'mobile',
        depth: 2,
        k: 1,
        strict: false,
        returnEvidence: false
      }
    },
    {
      name: 'India English - Mobile',
      body: {
        keyword: 'credit card lounge access',
        gl: 'IN',
        hl: 'en-IN',
        device: 'mobile',
        depth: 2,
        k: 1,
        strict: false,
        returnEvidence: false
      }
    },
    {
      name: 'UK English - Desktop',
      body: {
        keyword: 'seo tools',
        gl: 'GB',
        hl: 'en-GB',
        device: 'desktop',
        depth: 1,
        k: 1,
        strict: false,
        returnEvidence: false
      }
    }
  ];

  for (const testCase of testCases) {
    console.log(`📋 Test: ${testCase.name}`);
    console.log(`   Keyword: "${testCase.body.keyword}"`);
    console.log(`   Location: ${testCase.body.gl}/${testCase.body.hl}`);
    console.log(`   Device: ${testCase.body.device}\n`);

    try {
      const start = Date.now();
      const response = await fetch(`${API_URL}/api/paa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testCase.body)
      });

      const duration = Date.now() - start;
      const data = await response.json();

      if (!response.ok) {
        console.log(`   ❌ Error: ${data.error}`);
        if (data.details) {
          console.log(`   Details:`, data.details);
        }
      } else {
        console.log(`   ✅ Success!`);
        console.log(`   Duration: ${duration}ms`);
        console.log(`   PAAs Found: ${data.count}`);
        console.log(`   Top 5 Questions:`);
        data.results.slice(0, 5).forEach((r, i) => {
          console.log(`      ${i + 1}. ${r.question}`);
          console.log(`         Confidence: ${r.confidence}, Depth: ${r.depth}`);
        });
      }
    } catch (error) {
      console.log(`   ❌ Request failed: ${error.message}`);
    }

    console.log('\n' + '─'.repeat(80) + '\n');
  }
}

// Run tests
testPAAMiner().catch(console.error);
