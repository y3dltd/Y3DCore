import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
/**
 * API endpoint to fetch the latest successful planner optimization run.
 * GET /api/planner/latest-run
 */
export async function GET() {
    try {
        const latestRun = await prisma.aiReportRun.findFirst({
            where: {
                reportId: 'planner',
                status: 'success',
                // Ensure outputJson is not null and is a valid JSON object (basic check)
                outputJson: {
                    not: Prisma.JsonNull,
                    // Optionally add more specific checks if needed, e.g., path filtering
                    // path: ['taskSequence'], // Example: Ensure taskSequence exists
                },
            },
            orderBy: {
                finishedAt: 'desc',
            },
        });

        if (!latestRun) {
            return NextResponse.json({
                success: false,
                message: 'No successful planner run found in history.',
            });
        }

        // Validate the structure of outputJson using Zod
        // Parse the outputJson string before validation
        let parsedOutputJson;
        try {
            // Ensure outputJson is not null and is a string before parsing
            if (latestRun.outputJson === null || typeof latestRun.outputJson !== 'string') {
                // Handle cases where outputJson might be null or already an object (less likely based on error)
                throw new Error(`outputJson is not a string or is null, type: ${typeof latestRun.outputJson}`);
            }
            parsedOutputJson = JSON.parse(latestRun.outputJson);
        } catch (parseError) {
            console.error('Failed to parse outputJson:', parseError);
            console.error('Raw outputJson data:', latestRun.outputJson); // Log raw data on parse failure
            return NextResponse.json({
                success: false,
                message: 'Failed to parse planner run output.',
                error: 'Invalid JSON format',
            }, { status: 500 }); // Internal server error for parsing failure
        }

        // Return the parsed data directly, skipping Zod validation
        return NextResponse.json({
            success: true,
            runId: latestRun.id,
            finishedAt: latestRun.finishedAt,
            ...parsedOutputJson, // Spread the parsed data here
            // Keep original inputJson for reference if needed
            inputJson: latestRun.inputJson, // Uncomment to include the original input
        });

    } catch (error) {
        console.error('Error fetching or validating latest planner run:', error);
        return NextResponse.json(
            { success: false, error: (error as Error).message },
            { status: 500 }
        );
    }
} 
