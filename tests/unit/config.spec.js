import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const STORAGE_KEY = 'txt-relay:config:v1'

async function loadConfig() {
  return import('../../src/lib/config')
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  localStorage.clear()
})

describe('normalizeDir', () => {
  it('去掉首尾斜杠', async () => {
    const { normalizeDir } = await loadConfig()
    expect(normalizeDir('/files/')).toBe('files')
    expect(normalizeDir('/a/b/c/')).toBe('a/b/c')
  })

  it('合并连续斜杠', async () => {
    const { normalizeDir } = await loadConfig()
    expect(normalizeDir('a//b/')).toBe('a/b')
    expect(normalizeDir('a///b//c')).toBe('a/b/c')
  })

  it('空值与纯空格回退到 files', async () => {
    const { normalizeDir } = await loadConfig()
    expect(normalizeDir('')).toBe('files')
    expect(normalizeDir('   ')).toBe('files')
    expect(normalizeDir(undefined)).toBe('files')
    expect(normalizeDir(null)).toBe('files')
    expect(normalizeDir('/')).toBe('files')
  })
})

describe('detectRepoFromUrl', () => {
  it('识别 github.io 项目站点', async () => {
    const { detectRepoFromUrl } = await loadConfig()
    expect(detectRepoFromUrl('throne24.github.io', '/upload_files/')).toEqual({
      owner: 'throne24',
      repo: 'upload_files',
    })
  })

  it('多级路径只取第一段作为仓库名', async () => {
    const { detectRepoFromUrl } = await loadConfig()
    expect(detectRepoFromUrl('user.github.io', '/repo/files/sub/')).toEqual({
      owner: 'user',
      repo: 'repo',
    })
  })

  it('根路径、自定义域名、localhost 返回 null', async () => {
    const { detectRepoFromUrl } = await loadConfig()
    expect(detectRepoFromUrl('user.github.io', '/')).toBeNull()
    expect(detectRepoFromUrl('example.com', '/repo/')).toBeNull()
    expect(detectRepoFromUrl('localhost', '/repo/')).toBeNull()
    expect(detectRepoFromUrl('', '')).toBeNull()
  })

  it('保留用户名大小写', async () => {
    const { detectRepoFromUrl } = await loadConfig()
    expect(detectRepoFromUrl('User-name.github.io', '/repo/')).toEqual({
      owner: 'User-name',
      repo: 'repo',
    })
  })
})

describe('配置初始化', () => {
  it('本地无存储时使用默认值', async () => {
    const { config, isConfigured, canWrite } = await loadConfig()
    expect(config.branch).toBe('main')
    expect(config.dir).toBe('files')
    expect(config.token).toBe('')
    expect(isConfigured()).toBe(false)
    expect(canWrite()).toBe(false)
  })

  it('读取已保存的完整配置', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ owner: 'u', repo: 'r', branch: 'dev', dir: 'docs', token: 't' }),
    )
    const { config } = await loadConfig()
    expect(config).toMatchObject({ owner: 'u', repo: 'r', branch: 'dev', dir: 'docs', token: 't' })
  })

  it('空字段不覆盖已有默认值', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ owner: '', repo: '', branch: '', dir: '', token: '' }),
    )
    const { config } = await loadConfig()
    expect(config.owner).toBe('')
    expect(config.repo).toBe('')
    expect(config.branch).toBe('main')
    expect(config.dir).toBe('files')
    expect(config.token).toBe('')
  })

  it('非法 JSON 不抛出异常', async () => {
    localStorage.setItem(STORAGE_KEY, '{not-json')
    await expect(loadConfig()).resolves.toBeDefined()
  })
})

describe('saveConfig', () => {
  it('规范化分支与目录并写入 localStorage', async () => {
    const { config, saveConfig } = await loadConfig()
    saveConfig({ owner: 'u', repo: 'r', branch: '  ', dir: '/a//b/', token: ' t ' })

    expect(config.branch).toBe('main')
    expect(config.dir).toBe('a/b')
    expect(config.token).toBe(' t ')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toMatchObject({
      owner: 'u',
      repo: 'r',
      branch: 'main',
      dir: 'a/b',
      token: ' t ',
    })
  })

  it('localStorage 写入失败时不抛出', async () => {
    const { config, saveConfig } = await loadConfig()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => saveConfig({ owner: 'u', repo: 'r' })).not.toThrow()
    expect(config.owner).toBe('u')
  })
})

describe('isConfigured 与 canWrite', () => {
  it('isConfigured 只要求 owner 与 repo', async () => {
    const { config, isConfigured } = await loadConfig()
    config.owner = ''
    config.repo = 'r'
    expect(isConfigured()).toBe(false)
    config.owner = 'u'
    expect(isConfigured()).toBe(true)
  })

  it('canWrite 还要求 token', async () => {
    const { config, canWrite } = await loadConfig()
    config.owner = 'u'
    config.repo = 'r'
    config.token = ''
    expect(canWrite()).toBe(false)
    config.token = 't'
    expect(canWrite()).toBe(true)
  })
})
