import { reactive } from 'vue'
import { SITE } from '../site-config'

const STORAGE_KEY = 'txt-relay:config:v1'

// 部署在 GitHub Pages 项目站点时，从 https://用户名.github.io/仓库名/ 中识别仓库
export function detectRepoFromUrl(hostname, pathname) {
  const matched = String(hostname || '').match(/^([a-z0-9-]+)\.github\.io$/i)
  if (!matched) return null
  const repo = String(pathname || '').split('/').filter(Boolean)[0]
  if (!repo) return null
  return { owner: matched[1], repo }
}

const detected =
  typeof window === 'undefined'
    ? null
    : detectRepoFromUrl(window.location.hostname, window.location.pathname)

export const config = reactive({
  owner: detected?.owner || SITE.owner || '',
  repo: detected?.repo || SITE.repo || '',
  branch: SITE.branch || 'main',
  dir: SITE.dir || 'files',
  token: '',
})

export function normalizeDir(value) {
  const dir = String(value || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/')
  return dir || 'files'
}

try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  if (saved && typeof saved === 'object') {
    if (saved.owner) config.owner = saved.owner
    if (saved.repo) config.repo = saved.repo
    if (saved.branch) config.branch = saved.branch
    if (saved.dir) config.dir = saved.dir
    if (saved.token) config.token = saved.token
  }
} catch {
  // 本地存储不可用时忽略，继续使用默认值
}
//读取逻辑 持久化到localStorage
export function saveConfig(patch) {
  Object.assign(config, patch)
  config.branch = String(config.branch || '').trim() || 'main'
  config.dir = normalizeDir(config.dir)
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        owner: config.owner,
        repo: config.repo,
        branch: config.branch,
        dir: config.dir,
        token: config.token,
      }),
    )
  } catch {
    // 写入失败不影响本次使用
  }
}

export function isConfigured() {
  return Boolean(config.owner && config.repo)
}

export function canWrite() {
  return Boolean(config.owner && config.repo && config.token)
}
