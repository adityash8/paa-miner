/**
 * PAA Miner API Endpoint
 * POST /api/paa
 *
 * Extracts People Also Ask questions from Google SERPs with 99%+ accuracy
 * using consensus runs and real Chrome rendering
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runConsensus } from '@/lib/paaScraper';
import type { PAAParams } from '@/types';

const schema = z.object({
  keyword: z.string().min(2, 'Keyword must be at least 2 characters'),
  gl: z.string().length(2, 'Country code must be 2 letters (e.g., US, IN)').toUpperCase(),
  hl: z.string().min(2, 'Language code must be at least 2 characters (e.g., en, en-IN)'),
  device: z.enum(['mobile', 'desktop']).default(
    (process.env.DEFAULT_DEVICE === 'desktop' ? 'desktop' : 'mobile') as 'mobile' | 'desktop'
  ),
  depth: z.number().int().min(1).max(3).default(2),
  k: z.number().int().min(1).max(3).default(2),
  uule: z.string().optional(),
  strict: z.boolean().default(true),
  returnEvidence: z.boolean().default(true)
});

export const maxDuration = 60; // Vercel function timeout (Pro plan)

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse and validate request body
    const body = await req.json().catch(() => ({}));
    const params = schema.parse(body);

    console.log(`[PAA Miner] Starting run for keyword: "${params.keyword}" (${params.gl}/${params.hl})`);

    // Run consensus algorithm
    const { results, runs } = await runConsensus(params as PAAParams);

    const duration = Date.now() - startTime;

    console.log(`[PAA Miner] Completed in ${duration}ms. Found ${results.length} consensus PAAs.`);

    const payload = {
      success: true,
      params: {
        keyword: params.keyword,
        gl: params.gl,
        hl: params.hl,
        device: params.device,
        depth: params.depth,
        k: params.k,
        strict: params.strict
      },
      count: results.length,
      results, // [{question, norm, depth, parent, appearances, confidence}]
      evidence: params.returnEvidence ? runs : undefined,
      meta: {
        duration_ms: duration,
        runs_executed: params.k
      }
    };

    return NextResponse.json(payload, { status: 200 });

  } catch (e: any) {
    console.error('[PAA Miner] Error:', e);

    // Handle validation errors
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: e.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message
          }))
        },
        { status: 400 }
      );
    }

    // Handle other errors
    return NextResponse.json(
      {
        success: false,
        error: e.message || 'Failed to extract PAAs'
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    service: 'PAA Miner',
    status: 'healthy',
    version: '1.0.0',
    endpoints: {
      extract: {
        method: 'POST',
        path: '/api/paa',
        description: 'Extract People Also Ask questions from Google SERPs'
      }
    }
  });
}
