const API = 'https://api.github.com'

function encodePath(path) {
  return String(path || '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
}

function requestHeaders(config, extra = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
    ...extra,
  }
  if (config.token) headers.Authorization = `Bearer ${config.token}`
  return headers
}

function repoUrl(config) {
  return `${API}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`
}

function contentUrl(config, path) {
  const base = `${repoUrl(config)}/contents`
  const encoded = encodePath(path)
  const ref = config.branch ? `?ref=${encodeURIComponent(config.branch)}` : ''
  return `${base}${encoded ? '/' + encoded : ''}${ref}`
}

async function errorMessage(response) {
  let detail = ''
  try {
    const data = await response.json()
    if (data && typeof data.message === 'string') detail = data.message
  } catch {
    // 忽略无法解析的响应体
  }
  return statusMessage(response.status, detail)
}

function abortError() {
  const error = new Error('操作已取消')
  error.name = 'AbortError'
  return error
}

function statusMessage(status, detail) {
  if (status === 401) return '令牌无效或已过期，请在「仓库设置」中更新 Personal Access Token。'
  if (status === 403) {
    if (/rate limit/i.test(detail)) return 'GitHub API 调用过于频繁，请稍后再试；填写令牌可以提高额度。'
    return '权限不足：请确认令牌对该仓库拥有 Contents 读写权限。'
  }
  if (status === 404) {
    return '找不到仓库或分支（也可能是令牌没有该仓库的权限），请检查「仓库设置」。'
  }
  if (status === 409 || status === 422) {
    return '操作冲突，请刷新文件列表后重试。'
  }
  return detail || `请求失败（HTTP ${status}）`
}

export async function fetchRepo(config) {
  const response = await fetch(repoUrl(config), {
    headers: requestHeaders(config),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json()
}

export async function fetchBranch(config, branch) {
  const response = await fetch(`${repoUrl(config)}/branches/${encodeURIComponent(branch)}`, {
    headers: requestHeaders(config),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json()
}
// 列出目录下的所有文件
export async function listFiles(config) {
  const response = await fetch(contentUrl(config, config.dir), {
    headers: requestHeaders(config),
    cache: 'no-store',
  })

  if (response.status === 404) {
    const repoResponse = await fetch(repoUrl(config), {
      headers: requestHeaders(config),
      cache: 'no-store',
    })
    if (!repoResponse.ok) throw new Error(await errorMessage(repoResponse))

    // 目录 404 是正常的（还没上传过文件），但要区分「分支写错」的情况
    const info = await repoResponse.json()
    if (config.branch && config.branch !== info.default_branch) {
      const branchResponse = await fetch(`${repoUrl(config)}/branches/${encodeURIComponent(config.branch)}`, {
        headers: requestHeaders(config),
        cache: 'no-store',
      })
      if (branchResponse.status === 404) {
        throw new Error(
          `分支「${config.branch}」不存在，该仓库默认分支是「${info.default_branch}」，请在「仓库设置」中修改。`,
        )
      }
    }
    return []
  }

  if (!response.ok) throw new Error(await errorMessage(response))

  const data = await response.json()
  if (!Array.isArray(data)) return []
  return data.filter(item => item.type === 'file')
}
// 获取文件或目录的详细信息
export async function getEntry(config, path, options = {}) {
  const response = await fetch(contentUrl(config, path), {
    headers: requestHeaders(config),
    cache: 'no-store',
    signal: options.signal,
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json()
}

// 目录接口不返回更新时间，用最近 100 条提交里的「上传文件：xxx」还原各文件的上传时间
export async function listFileDates(config) {
  const params = new URLSearchParams({ per_page: '100' })
  if (config.dir) params.set('path', config.dir)
  if (config.branch) params.set('sha', config.branch)

  const response = await fetch(`${repoUrl(config)}/commits?${params.toString()}`, {
    headers: requestHeaders(config),
    cache: 'no-store',
  })
  if (!response.ok) return new Map()

  const data = await response.json()
  const dates = new Map()
  for (const entry of Array.isArray(data) ? data : []) {
    const message = entry?.commit?.message || ''
    if (!message.startsWith('上传文件：')) continue
    const name = message.slice('上传文件：'.length).trim()
    if (!name || dates.has(name)) continue
    const date = entry.commit.committer?.date || entry.commit.author?.date || ''
    if (date) dates.set(name, date)
  }
  return dates
}
// 上传请求的兜底超时：连接卡死时给出明确提示，而不是无限等待
const UPLOAD_TIMEOUT = 10 * 60 * 1000

// 上传文件
export function uploadFile(config, path, base64Content, sha, options = {}) {
  const { onProgress, signal, timeout = UPLOAD_TIMEOUT } = options
  if (signal?.aborted) return Promise.reject(abortError())

  const body = JSON.stringify({
    message: `上传文件：${path.split('/').pop()}`,
    content: base64Content,
    ...(config.branch ? { branch: config.branch } : {}),
    ...(sha ? { sha } : {}),
  })

  // 用 XHR 而不是 fetch，才能拿到真实的上传字节进度
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', `${repoUrl(config)}/contents/${encodePath(path)}`)

    const headers = requestHeaders(config, { 'Content-Type': 'application/json' })
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value)

    const onAbort = () => xhr.abort()
    const settle = () => signal?.removeEventListener('abort', onAbort)
    signal?.addEventListener('abort', onAbort)
    xhr.timeout = timeout

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) onProgress(event.loaded, event.total)
      }
    }

    xhr.onload = () => {
      settle()
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(xhr.responseText ? JSON.parse(xhr.responseText) : {})
        } catch {
          resolve({})
        }
        return
      }

      let detail = ''
      try {
        const data = JSON.parse(xhr.responseText)
        if (data && typeof data.message === 'string') detail = data.message
      } catch {
        // 忽略无法解析的响应体
      }
      reject(new Error(statusMessage(xhr.status, detail)))
    }

    xhr.onerror = () => {
      settle()
      reject(new Error('网络异常，上传中断，请检查网络后重试。'))
    }
    xhr.ontimeout = () => {
      settle()
      reject(new Error('上传超时，请检查网络后重试。'))
    }
    xhr.onabort = () => {
      settle()
      reject(abortError())
    }

    if (signal?.aborted) {
      settle()
      reject(abortError())
      return
    }
    xhr.send(body)
  })
}

const FILE_CACHE = 'txt-relay:files:v1'
const MIRROR_PREFIX = 'https://ghfast.top/'
const MIRROR_FIRST_BYTE_TIMEOUT = 12000

function rawUrl(config, item) {
  if (item.download_url) return item.download_url
  const branch = encodeURIComponent(config.branch || 'main')
  return `https://raw.githubusercontent.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/${branch}/${encodePath(item.path)}`
}

// 镜像只接受公开仓库的直链，超时或失败时回退 GitHub API
async function fetchWithFirstByteTimeout(url, init, timeout) {
  if (!timeout) return fetch(url, init)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const onAbort = () => controller.abort()
  init.signal?.addEventListener('abort', onAbort)

  try {
    // 成功后保留外部 signal 的监听：响应体还在流式读取，取消仍需要中止请求
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    init.signal?.removeEventListener('abort', onAbort)
    if (error?.name === 'AbortError' && !init.signal?.aborted) return null
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function canCache(config, item) {
  return Boolean(
    item?.sha && config.owner && config.repo && typeof caches !== 'undefined' && typeof location !== 'undefined',
  )
}

function cacheBase(config) {
  return `${location.origin}/__file-cache/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/`
}

function cacheKey(config, item) {
  return `${cacheBase(config)}${item.sha}/${encodePath(item.path)}`
}

async function readCachedFile(config, item, onProgress) {
  if (!canCache(config, item)) return null
  try {
    const cache = await caches.open(FILE_CACHE)
    const hit = await cache.match(cacheKey(config, item))
    if (!hit) return null
    const blob = await hit.blob()
    onProgress?.(blob.size, blob.size)
    return blob
  } catch {
    // 缓存不可用（隐私模式或配额异常）时退回网络请求
    return null
  }
}

async function writeCachedFile(config, item, blob) {
  if (!canCache(config, item)) return
  try {
    const cache = await caches.open(FILE_CACHE)
    const key = cacheKey(config, item)
    await cache.put(key, new Response(blob, { headers: { 'X-Relay-Path': encodeURIComponent(item.path) } }))

    // 同一路径上传了新版本时清掉旧 sha 的缓存，避免长期堆积
    const base = cacheBase(config)
    const encodedPath = encodeURIComponent(item.path)
    for (const request of await cache.keys()) {
      if (request.url === key || !request.url.startsWith(base)) continue
      const cached = await cache.match(request)
      if (cached?.headers.get('X-Relay-Path') === encodedPath) await cache.delete(request)
    }
  } catch {
    // 缓存写入失败不影响本次使用
  }
}

async function readBlob(response, expectedSize, onProgress) {
  if (!response.body || !onProgress) return response.blob()

  const reader = response.body.getReader()
  const chunks = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    onProgress(received, expectedSize || received)
  }
  return new Blob(chunks, { type: response.headers.get('content-type') || '' })
}
// 下载文件
export async function downloadFile(config, item, options = {}) {
  const { signal, onProgress } = options
  const cached = await readCachedFile(config, item, onProgress)
  if (cached) return cached

  // 依次尝试：镜像（快，超时即回退）→ GitHub API → 官方直链
  const sources = [
    { url: `${MIRROR_PREFIX}${rawUrl(config, item)}`, headers: { Accept: '*/*' }, timeout: MIRROR_FIRST_BYTE_TIMEOUT },
    {
      url: contentUrl(config, item.path),
      headers: requestHeaders(config, { Accept: 'application/vnd.github.raw' }),
      timeout: 0,
    },
  ]
  if (item.download_url) {
    sources.push({ url: item.download_url, headers: {}, timeout: 0 })
  }

  let failure = null

  for (const source of sources) {
    let response
    try {
      response = await fetchWithFirstByteTimeout(
        source.url,
        { headers: source.headers, cache: 'no-store', signal },
        source.timeout,
      )
    } catch (error) {
      if (error?.name === 'AbortError') throw error
      // 当前来源失败，继续尝试下一个
      continue
    }
    if (!response) continue

    if (response.ok) {
      const blob = await readBlob(response, item.size, onProgress)
      await writeCachedFile(config, item, blob)
      return blob
    }
    failure = response
  }

  if (failure) throw new Error(await errorMessage(failure))
  throw new Error('读取文件失败，请检查网络后重试。')
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export async function deleteEntry(config, item) {
  const response = await fetch(`${repoUrl(config)}/contents/${encodePath(item.path)}`, {
    method: 'DELETE',
    headers: requestHeaders(config, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message: `删除文件：${item.name}`,
      sha: item.sha,
      ...(config.branch ? { branch: config.branch } : {}),
    }),
  })
  if (!response.ok) throw new Error(await errorMessage(response))
}

export function sanitizeFilename(name) {
  const base = String(name || '').split(/[\\/]/).pop() || 'file.txt'
  const cleaned = base
    .replace(/[<>:"|?*\x00-\x1f]/g, '_')
    .replace(/^\.+/, '')
    .trim()
  const result = cleaned || 'file.txt'
  if (result.length <= 160) return result
  const dot = result.lastIndexOf('.')
  const extension = dot > -1 ? result.slice(dot) : ''
  return result.slice(0, 160 - extension.length) + extension
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      const comma = text.indexOf(',')
      resolve(comma >= 0 ? text.slice(comma + 1) : text)
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}
