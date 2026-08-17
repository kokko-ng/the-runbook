/**
 * Same-origin API client.
 *
 * The API uses Django session auth, so every state-changing request carries the
 * CSRF token. The token is fetched once and refreshed whenever the server
 * rejects a request for it.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

let csrfToken: string | null = null

function cookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

async function ensureCsrf(): Promise<string> {
  const fromCookie = cookie('csrftoken')
  if (fromCookie) {
    csrfToken = fromCookie
    return fromCookie
  }
  if (csrfToken) return csrfToken

  const resp = await fetch('/api/auth/csrf', { credentials: 'same-origin' })
  if (!resp.ok) throw new ApiError(resp.status, 'Could not reach the server.')
  csrfToken = ((await resp.json()) as { csrf_token: string }).csrf_token
  return csrfToken
}

async function parseError(resp: Response): Promise<string> {
  try {
    const body = (await resp.json()) as { detail?: string; message?: string }
    return body.detail ?? body.message ?? 'The server rejected that request.'
  } catch {
    return 'The server rejected that request.'
  }
}

export async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET') headers['X-CSRFToken'] = await ensureCsrf()

  let resp: Response
  try {
    resp = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Your game is saved on this device.')
  }

  if (resp.status === 403 && method !== 'GET') {
    // A rotated or missing CSRF token; refresh it and try once more.
    csrfToken = null
    headers['X-CSRFToken'] = await ensureCsrf()
    resp = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  if (!resp.ok) throw new ApiError(resp.status, await parseError(resp))
  if (resp.status === 204) return undefined as T
  return (await resp.json()) as T
}
