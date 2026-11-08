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
    'X-GitHub-Api-Version': '2022-11-28',
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

  if (response.status === 401) return '令牌无效或已过期，请在「仓库设置」中更新 Personal Access Token。'
  if (response.status === 403) {
    if (/rate limit/i.test(detail)) return 'GitHub API 调用过于频繁，请稍后再试；填写令牌可以提高额度。'
    return '权限不足：请确认令牌对该仓库拥有 Contents 读写权限。'
  }
  if (response.status === 404) {
    return '找不到仓库或分支（也可能是令牌没有该仓库的权限），请检查「仓库设置」。'
  }
  if (response.status === 409 || response.status === 422) {
    return '操作冲突，请刷新文件列表后重试。'
  }
  return detail || `请求失败（HTTP ${response.status}）`
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

export async function getEntry(config, path) {
  const response = await fetch(contentUrl(config, path), {
    headers: requestHeaders(config),
    cache: 'no-store',
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json()
}

export async function uploadFile(config, path, base64Content, sha) {
  const response = await fetch(`${repoUrl(config)}/contents/${encodePath(path)}`, {
    method: 'PUT',
    headers: requestHeaders(config, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message: `上传文件：${path.split('/').pop()}`,
      content: base64Content,
      ...(config.branch ? { branch: config.branch } : {}),
      ...(sha ? { sha } : {}),
    }),
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json()
}

export async function downloadFile(config, item) {
  const response = await fetch(contentUrl(config, item.path), {
    headers: requestHeaders(config, { Accept: 'application/vnd.github.raw' }),
    cache: 'no-store',
  })
  if (response.ok) return response.blob()

  if (item.download_url) {
    const fallback = await fetch(item.download_url, { cache: 'no-store' })
    if (fallback.ok) return fallback.blob()
  }

  throw new Error(await errorMessage(response))
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
