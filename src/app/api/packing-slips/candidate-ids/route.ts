import { NextResponse } from 'next/server';

import { getCandidateOrderIds } from '@/lib/packing-slips';

// /api/packing-slips/candidate-ids?window=today&limit=50&includePrinted=false
export async function GET(req: Request) {
    const url = new URL(req.url);
    const windowParam = (url.searchParams.get('window') || 'remaining') as 'today' | 'tomorrow' | 'remaining';
    const limitParam = url.searchParams.get('limit') || '50';
    const includePrintedParam = url.searchParams.get('includePrinted') || 'false';

    if (!['today', 'tomorrow', 'remaining'].includes(windowParam)) {
        return new NextResponse('Invalid "window"', { status: 400 });
    }

    const limit: number | 'all' = limitParam === 'all' ? 'all' : parseInt(limitParam, 10);
    if (limit !== 'all' && (isNaN(limit) || limit <= 0)) {
        return new NextResponse('Invalid "limit"', { status: 400 });
    }

    const includePrinted = includePrintedParam === 'true' || includePrintedParam === '1';

    try {
        const ids = await getCandidateOrderIds({ window: windowParam, limit, includePrinted });
        return NextResponse.json({ ids });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('candidate-ids error', err);
        return new NextResponse('Server error', { status: 500 });
    }
} 
