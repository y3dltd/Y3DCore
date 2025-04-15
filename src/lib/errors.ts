import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

interface ErrorResponse {
  message: string;
  details?: unknown; // Optional field for more specific error details
}

/**
 * Creates a standardized JSON error response.
 * @param message - The error message.
 * @param status - The HTTP status code.
 * @param details - Optional additional error details.
 * @returns A NextResponse object with the error payload.
 */
export function createErrorResponse(
  message: string,
  status: number,
  details?: unknown
): NextResponse<ErrorResponse> {
  const responseBody: ErrorResponse = { message };
  if (details) {
    responseBody.details = details;
  }
  return NextResponse.json(responseBody, { status });
}

// Example Custom Error Class (can be expanded)
export class ApiError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode: number = 500, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    // Ensure the stack trace is captured correctly
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }
}

/**
 * Handles errors within API routes, logging them and returning a standardized response.
 * @param error - The error object caught.
 * @returns A NextResponse object with the error payload.
 */
export function handleApiError(error: unknown): NextResponse<ErrorResponse> {
  console.error('API Error:', error); // Log the full error for debugging

  if (error instanceof ApiError) {
    return createErrorResponse(error.message, error.statusCode, error.details);
  }

  // Handle Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Handle specific Prisma error codes
    switch (error.code) {
      case 'P2002': // Unique constraint violation
        return createErrorResponse('A record with this identifier already exists', 409, { code: error.code, fields: error.meta?.target });
      case 'P2025': // Record not found
        return createErrorResponse('Record not found', 404, { code: error.code });
      case 'P2003': // Foreign key constraint failed
        return createErrorResponse('Related record not found', 400, { code: error.code, field: error.meta?.field_name });
      case 'P2014': // Required relation violation
        return createErrorResponse('Required relation missing', 400, { code: error.code });
      default:
        return createErrorResponse('Database error occurred', 500, { code: error.code });
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return createErrorResponse('Invalid data provided', 400, { name: error.name });
  }

  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return createErrorResponse('Critical database error', 500, { name: error.name });
  }

  // Generic fallback error
  return createErrorResponse('Internal Server Error', 500);
}
