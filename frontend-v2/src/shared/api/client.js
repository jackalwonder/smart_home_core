const DEFAULT_TIMEOUT_MS = 15000

function trimTrailingSlash(value = '') {
  return value.replace(/\/+$/, '')
}

function buildBaseUrl() {
  return trimTrailingSlash(import.meta.env.VITE_API_BASE_URL || '')
}

function buildUrl(path, query = undefined) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${buildBaseUrl()}${normalizedPath}`, window.location.origin)

  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return
      }
      url.searchParams.set(key, String(value))
    })
  }

  return url.toString()
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    return response.json()
  }

  if (contentType.startsWith('text/')) {
    return response.text()
  }

  return null
}

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status ?? 0
    this.data = options.data ?? null
    this.url = options.url ?? ''
  }
}

async function request(path, options = {}) {
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  const headers = new Headers(options.headers || {})
  headers.set('Accept', 'application/json')

  let body = options.body
  if (body && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(body)
  }

  const url = buildUrl(path, options.query)

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      credentials: 'include',
      headers,
      body,
      signal: options.signal || controller.signal,
    })

    const data = await parseResponse(response)

    if (!response.ok) {
      const message =
        data?.detail ||
        data?.message ||
        `Request failed with status ${response.status}`

      throw new ApiError(message, {
        status: response.status,
        data,
        url,
      })
    }

    return data
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    if (error?.name === 'AbortError') {
      throw new ApiError('Request timed out.', { status: 408, url })
    }

    throw new ApiError(error?.message || 'Network request failed.', { url })
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export const apiClient = {
  get(path, options = {}) {
    return request(path, { ...options, method: 'GET' })
  },
  post(path, body, options = {}) {
    return request(path, { ...options, method: 'POST', body })
  },
  put(path, body, options = {}) {
    return request(path, { ...options, method: 'PUT', body })
  },
  delete(path, options = {}) {
    return request(path, { ...options, method: 'DELETE' })
  },
}

export function buildWebSocketUrl(path) {
  const explicitBase = trimTrailingSlash(import.meta.env.VITE_WS_BASE_URL || '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (explicitBase) {
    return `${explicitBase}${normalizedPath}`
  }

  const apiBase = buildBaseUrl()
  const base = apiBase || window.location.origin
  const wsBase = base.replace(/^http/i, 'ws')
  return `${trimTrailingSlash(wsBase)}${normalizedPath}`
}
