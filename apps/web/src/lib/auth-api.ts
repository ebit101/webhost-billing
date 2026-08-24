'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface PaginatedApiSuccess<T> extends ApiSuccess<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

interface ApiFailure {
  success: false;
  error: { code: string; message: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function responseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function errorMessage(body: unknown): string {
  if (
    isRecord(body) &&
    isRecord(body.error) &&
    typeof body.error.message === 'string'
  ) {
    return body.error.message;
  }

  return 'The request could not be completed.';
}

async function csrfToken(): Promise<string> {
  const response = await fetch(`${API_URL}/auth/csrf`, {
    credentials: 'include',
    cache: 'no-store',
  });
  const body = await responseBody(response);

  if (
    !response.ok ||
    !isRecord(body) ||
    !isRecord(body.data) ||
    typeof body.data.csrfToken !== 'string'
  ) {
    throw new Error(errorMessage(body));
  }

  return body.data.csrfToken;
}

export async function authMutation<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: Record<string, unknown>,
): Promise<T> {
  const csrf = await csrfToken();
  const response = await fetch(`${API_URL}${path}`, {
    method,
    credentials: 'include',
    headers: {
      'X-CSRF-Token': csrf,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const responseValue = await responseBody(response);

  if (
    !response.ok ||
    !isRecord(responseValue) ||
    responseValue.success !== true ||
    !('data' in responseValue)
  ) {
    throw new Error(errorMessage(responseValue));
  }

  return (responseValue as unknown as ApiSuccess<T>).data;
}

export async function authenticatedPaginatedGet<T>(path: string) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  const body = await responseBody(response);
  if (
    !response.ok ||
    !isRecord(body) ||
    body.success !== true ||
    !Array.isArray(body.data) ||
    !isRecord(body.pagination)
  ) {
    throw new Error(errorMessage(body));
  }
  return body as unknown as PaginatedApiSuccess<T>;
}

export async function authenticatedGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  const body = await responseBody(response);

  if (
    !response.ok ||
    !isRecord(body) ||
    body.success !== true ||
    !('data' in body)
  ) {
    throw new Error(errorMessage(body));
  }

  return (body as unknown as ApiSuccess<T>).data;
}

export type { ApiFailure, PaginatedApiSuccess };
