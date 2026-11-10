import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteEntry,
  downloadFile,
  fetchBranch,
  fetchRepo,
  fileToBase64,
  getEntry,
  listFileDates,
  listFiles,
  sanitizeFilename,
  saveBlob,
  uploadFile,
} from '../../src/lib/github'

const config = {
  owner: 'user',
  repo: 'repo',
  branch: 'main',
  dir: 'files',
  token: '',
}

const fileItem = {
  name: 'a.txt',
  path: 'files/a.txt',
  sha: 'sha-a',
  size: 5,
  type: 'file',
  download_url: 'https://raw.githubusercontent.com/user/repo/main/files/a.txt',
}

function jsonResponse(status, data) {
  const ok = status >= 200 && status < 300
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
    blob: vi.fn().mockResolvedValue(new Blob()),
    headers: { get: () => 'application/json' },
  }
}

function blobResponse(blob, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue({ message: 'unexpected' }),
    blob: vi.fn().mockResolvedValue(blob),
    body: null,
    headers: { get: () => 'application/octet-stream' },
  }
}

function streamResponse(chunks, contentType = 'text/plain') {
  let index = 0
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          read: async () =>
            index < chunks.length ? { done: false, value: chunks[index++] } : { done: true },
        }
      },
    },
    blob: vi.fn(),
    headers: { get: () => contentType },
  }
}

class FakeXHR {
  static instances = []

  constructor() {
    this.headers = {}
    this.upload = {}
    this.status = 0
    this.responseText = ''
    this.aborted = false
    FakeXHR.instances.push(this)
  }

  open(method, url) {
    this.method = method
    this.url = url
  }

  setRequestHeader(name, value) {
    this.headers[name] = value
  }

  send(body) {
    this.body = body
  }

  respond(status, text) {
    this.status = status
    this.responseText = text
    this.onload?.()
  }

  abort() {
    this.aborted = true
    this.onabort?.()
  }
}

let fetchMock

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  // 默认关闭 Cache Storage，网络路径的用例不受缓存影响
  vi.stubGlobal('caches', undefined)
  FakeXHR.instances = []
  vi.stubGlobal('XMLHttpRequest', FakeXHR)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchRepo 与 fetchBranch', () => {
  it('请求仓库信息并带上令牌', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { default_branch: 'main' }))
    const data = await fetchRepo({ ...config, token: 'tok' })

    expect(data).toEqual({ default_branch: 'main' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/user/repo')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(init.cache).toBe('no-store')
  })

  it('无令牌时不发送 Authorization', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}))
    await fetchRepo(config)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })

  it('分支名中的斜杠会被编码', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}))
    await fetchBranch(config, 'feature/dev')
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/user/repo/branches/feature%2Fdev',
    )
  })

  it('请求失败时抛出映射后的提示', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Bad credentials' }))
    await expect(fetchRepo(config)).rejects.toThrow('令牌无效或已过期')
  })
})

describe('错误状态映射', () => {
  const cases = [
    [401, {}, '令牌无效或已过期'],
    [403, { message: 'API rate limit exceeded' }, 'GitHub API 调用过于频繁'],
    [403, { message: 'Resource not accessible' }, '权限不足'],
    [404, { message: 'Not Found' }, '找不到仓库或分支'],
    [409, { message: 'Conflict' }, '操作冲突'],
    [422, { message: 'Invalid request' }, '操作冲突'],
    [500, { message: 'boom' }, 'boom'],
    [500, {}, '请求失败（HTTP 500）'],
  ]

  for (const [status, body, expected] of cases) {
    it(`${status} ${JSON.stringify(body)} → ${expected}`, async () => {
      fetchMock.mockResolvedValue(jsonResponse(status, body))
      await expect(fetchRepo(config)).rejects.toThrow(expected)
    })
  }

  it('响应体不是 JSON 时仍返回状态提示', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: vi.fn().mockRejectedValue(new Error('invalid json')),
      headers: { get: () => 'text/html' },
    })
    await expect(fetchRepo(config)).rejects.toThrow('请求失败（HTTP 502）')
  })
})

describe('listFiles', () => {
  it('拼接目录与分支参数，并过滤目录项', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, [
        { name: 'a.txt', type: 'file' },
        { name: 'sub', type: 'dir' },
      ]),
    )
    const files = await listFiles(config)

    expect(files).toEqual([{ name: 'a.txt', type: 'file' }])
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/user/repo/contents/files?ref=main',
    )
  })

  it('中文与空格目录会被正确编码', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []))
    await listFiles({ ...config, dir: '我的 文件', token: 'tok' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://api.github.com/repos/user/repo/contents/%E6%88%91%E7%9A%84%20%E6%96%87%E4%BB%B6?ref=main',
    )
    expect(init.headers.Authorization).toBe('Bearer tok')
  })

  it('目录 404 且分支正常时返回空数组', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(404, { message: 'Not Found' }))
      .mockResolvedValueOnce(jsonResponse(200, { default_branch: 'main' }))

    await expect(listFiles(config)).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('分支存在但目录为空时返回空数组', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(404, { message: 'Not Found' }))
      .mockResolvedValueOnce(jsonResponse(200, { default_branch: 'main' }))
      .mockResolvedValueOnce(jsonResponse(200, { name: 'dev' }))

    await expect(listFiles({ ...config, branch: 'dev' })).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('分支写错时抛出包含默认分支的提示', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(404, { message: 'Not Found' }))
      .mockResolvedValueOnce(jsonResponse(200, { default_branch: 'main' }))
      .mockResolvedValueOnce(jsonResponse(404, { message: 'Not Found' }))

    await expect(listFiles({ ...config, branch: 'dev' })).rejects.toThrow(
      '分支「dev」不存在，该仓库默认分支是「main」',
    )
  })

  it('目录 404 且仓库也不可读时抛出仓库错误', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(404, { message: 'Not Found' }))
      .mockResolvedValueOnce(jsonResponse(404, { message: 'Not Found' }))

    await expect(listFiles(config)).rejects.toThrow('找不到仓库或分支')
  })

  it('接口返回非数组时返回空数组', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { message: 'not a list' }))
    await expect(listFiles(config)).resolves.toEqual([])
  })

  it('其他错误状态直接抛出', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { message: 'boom' }))
    await expect(listFiles(config)).rejects.toThrow('boom')
  })
})

describe('listFileDates', () => {
  it('从提交信息中还原各文件的上传时间', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, [
        {
          commit: {
            message: '上传文件：a.txt',
            committer: { date: '2026-01-02T03:04:05Z' },
          },
        },
        {
          commit: {
            message: '上传文件：a.txt',
            committer: { date: '2026-02-02T03:04:05Z' },
          },
        },
        {
          commit: {
            message: '删除文件：b.txt',
            committer: { date: '2026-01-03T00:00:00Z' },
          },
        },
        { commit: { message: '上传文件：  ' } },
        {
          commit: {
            message: '上传文件：c.pdf',
            author: { date: '2026-01-04T00:00:00Z' },
          },
        },
      ]),
    )

    const dates = await listFileDates(config)

    expect(dates.get('a.txt')).toBe('2026-01-02T03:04:05Z')
    expect(dates.get('c.pdf')).toBe('2026-01-04T00:00:00Z')
    expect(dates.has('b.txt')).toBe(false)
    expect(dates.size).toBe(2)
  })

  it('带目录与分支查询参数', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []))
    await listFileDates(config)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/user/repo/commits?per_page=100&path=files&sha=main',
    )
  })

  it('无目录与分支时只发送分页参数', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []))
    await listFileDates({ ...config, dir: '', branch: '' })
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/user/repo/commits?per_page=100',
    )
  })

  it('请求失败时返回空 Map 而不阻塞列表', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { message: 'boom' }))
    const dates = await listFileDates(config)
    expect(dates).toBeInstanceOf(Map)
    expect(dates.size).toBe(0)
  })
})

describe('getEntry', () => {
  it('404 返回 null', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { message: 'Not Found' }))
    await expect(getEntry(config, 'files/a.txt')).resolves.toBeNull()
  })

  it('成功时返回文件信息', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { sha: 'abc' }))
    await expect(getEntry(config, 'files/a.txt')).resolves.toEqual({ sha: 'abc' })
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/user/repo/contents/files/a.txt?ref=main',
    )
  })

  it('其他错误抛出映射提示', async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { message: 'API rate limit exceeded' }))
    await expect(getEntry(config, 'files/a.txt')).rejects.toThrow('GitHub API 调用过于频繁')
  })

  it('透传取消信号', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { sha: 'abc' }))
    const controller = new AbortController()

    await getEntry(config, 'files/a.txt', { signal: controller.signal })

    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal)
  })
})

describe('uploadFile', () => {
  it('发送 PUT 请求并携带 base64、分支与 sha', async () => {
    const onProgress = vi.fn()
    const promise = uploadFile(config, 'files/报告 1.pdf', 'BASE64', 'old-sha', { onProgress })
    const xhr = FakeXHR.instances[0]

    expect(xhr.method).toBe('PUT')
    expect(xhr.url).toBe(
      'https://api.github.com/repos/user/repo/contents/files/%E6%8A%A5%E5%91%8A%201.pdf',
    )
    expect(xhr.headers['Content-Type']).toBe('application/json')
    expect(xhr.headers.Authorization).toBeUndefined()

    const body = JSON.parse(xhr.body)
    expect(body).toEqual({
      message: '上传文件：报告 1.pdf',
      content: 'BASE64',
      branch: 'main',
      sha: 'old-sha',
    })

    xhr.upload.onprogress({ lengthComputable: true, loaded: 5, total: 10 })
    expect(onProgress).toHaveBeenCalledWith(5, 10)

    xhr.respond(201, '{"content":{"name":"报告 1.pdf"}}')
    await expect(promise).resolves.toEqual({ content: { name: '报告 1.pdf' } })
  })

  it('无分支、无 sha 时请求体省略对应字段', async () => {
    const promise = uploadFile({ ...config, branch: '' }, 'a.txt', 'QQ==')
    const xhr = FakeXHR.instances[0]
    const body = JSON.parse(xhr.body)

    expect(body).toEqual({ message: '上传文件：a.txt', content: 'QQ==' })
    expect(xhr.headers.Authorization).toBeUndefined()

    xhr.respond(201, '')
    await expect(promise).resolves.toEqual({})
  })

  it('带令牌时发送 Bearer 头', async () => {
    const promise = uploadFile({ ...config, token: 'tok' }, 'a.txt', 'QQ==')
    const xhr = FakeXHR.instances[0]
    expect(xhr.headers.Authorization).toBe('Bearer tok')
    xhr.respond(201, '{}')
    await promise
  })

  it('忽略不可计算长度的进度事件', async () => {
    const onProgress = vi.fn()
    const promise = uploadFile(config, 'a.txt', 'QQ==', undefined, { onProgress })
    const xhr = FakeXHR.instances[0]

    xhr.upload.onprogress({ lengthComputable: false, loaded: 1, total: 2 })
    expect(onProgress).not.toHaveBeenCalled()

    xhr.respond(201, '{}')
    await promise
  })

  it('HTTP 错误被映射为中文提示', async () => {
    const promise = uploadFile(config, 'a.txt', 'QQ==')
    const xhr = FakeXHR.instances[0]
    xhr.respond(409, '{"message":"Conflict"}')
    await expect(promise).rejects.toThrow('操作冲突')
  })

  it('网络错误与超时给出明确提示', async () => {
    const networkPromise = uploadFile(config, 'a.txt', 'QQ==')
    FakeXHR.instances[0].onerror()
    await expect(networkPromise).rejects.toThrow('网络异常，上传中断')

    const timeoutPromise = uploadFile(config, 'a.txt', 'QQ==')
    FakeXHR.instances[1].ontimeout()
    await expect(timeoutPromise).rejects.toThrow('上传超时')
  })

  it('默认设置 10 分钟超时，并支持自定义', async () => {
    const defaultPromise = uploadFile(config, 'a.txt', 'QQ==')
    expect(FakeXHR.instances[0].timeout).toBe(600000)
    FakeXHR.instances[0].respond(201, '{}')
    await defaultPromise

    const customPromise = uploadFile(config, 'a.txt', 'QQ==', undefined, { timeout: 1500 })
    expect(FakeXHR.instances[1].timeout).toBe(1500)
    FakeXHR.instances[1].respond(201, '{}')
    await customPromise
  })

  it('信号已取消时直接拒绝且不发起请求', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      uploadFile(config, 'a.txt', 'QQ==', undefined, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(FakeXHR.instances).toHaveLength(0)
  })

  it('上传过程中取消会中止请求并以 AbortError 拒绝', async () => {
    const controller = new AbortController()
    const promise = uploadFile(config, 'a.txt', 'QQ==', undefined, { signal: controller.signal })
    const xhr = FakeXHR.instances[0]

    controller.abort()

    expect(xhr.aborted).toBe(true)
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('downloadFile', () => {
  it('优先从镜像下载，并返回 Blob', async () => {
    const blob = new Blob(['hello'])
    fetchMock.mockResolvedValueOnce(blobResponse(blob))

    const result = await downloadFile(config, fileItem)

    expect(result).toBe(blob)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://ghfast.top/https://raw.githubusercontent.com/user/repo/main/files/a.txt',
    )
  })

  it('没有 download_url 时自行拼接 raw 直链', async () => {
    const blob = new Blob(['x'])
    fetchMock.mockResolvedValueOnce(blobResponse(blob))
    const item = { ...fileItem, download_url: undefined }

    await downloadFile(config, item)

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://ghfast.top/https://raw.githubusercontent.com/user/repo/main/files/a.txt',
    )
  })

  it('镜像失败后回退 GitHub API raw', async () => {
    const blob = new Blob(['fallback'])
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, { message: 'mirror down' }))
      .mockResolvedValueOnce(blobResponse(blob))

    const result = await downloadFile(config, fileItem)

    expect(result).toBe(blob)
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.github.com/repos/user/repo/contents/files/a.txt?ref=main',
    )
    expect(fetchMock.mock.calls[1][1].headers.Accept).toBe('application/vnd.github.raw')
  })

  it('镜像与 API 都失败后回退 download_url', async () => {
    const blob = new Blob(['third'])
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, { message: 'mirror down' }))
      .mockResolvedValueOnce(jsonResponse(500, { message: 'api down' }))
      .mockResolvedValueOnce(blobResponse(blob))

    await expect(downloadFile(config, fileItem)).resolves.toBe(blob)
    expect(fetchMock.mock.calls[2][0]).toBe(fileItem.download_url)
  })

  it('所有来源失败时抛出最后一个响应的映射提示', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, { message: 'mirror down' }))
      .mockResolvedValueOnce(jsonResponse(404, { message: 'Not Found' }))

    const item = { ...fileItem, download_url: undefined }
    await expect(downloadFile(config, item)).rejects.toThrow('找不到仓库或分支')
  })

  it('所有来源网络异常时抛出统一提示', async () => {
    fetchMock.mockRejectedValue(new TypeError('network error'))
    const item = { ...fileItem, download_url: undefined }
    await expect(downloadFile(config, item)).rejects.toThrow('读取文件失败，请检查网络后重试')
  })

  it('镜像首字节超时后自动回退 API', async () => {
    vi.useFakeTimers()
    const blob = new Blob(['after timeout'])

    fetchMock.mockImplementationOnce((url, init) => {
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    })
    fetchMock.mockResolvedValueOnce(blobResponse(blob))

    const promise = downloadFile(config, fileItem)
    await vi.advanceTimersByTimeAsync(12000)

    await expect(promise).resolves.toBe(blob)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('用户主动取消时直接抛出 AbortError，不继续回退', async () => {
    const controller = new AbortController()
    controller.abort()
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))

    await expect(downloadFile(config, fileItem, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('镜像响应体读取期间取消仍会中止请求', async () => {
    const controller = new AbortController()
    let signalRef
    let startRead
    const reading = new Promise(resolve => {
      startRead = resolve
    })

    fetchMock.mockImplementationOnce((url, init) => {
      signalRef = init.signal
      return Promise.resolve({
        ok: true,
        status: 200,
        json: vi.fn(),
        blob: vi.fn(),
        headers: { get: () => 'application/octet-stream' },
        body: {
          getReader: () => ({
            read: () => {
              startRead()
              return new Promise((resolve, reject) => {
                init.signal.addEventListener('abort', () => {
                  const error = new Error('aborted')
                  error.name = 'AbortError'
                  reject(error)
                })
              })
            },
          }),
        },
      })
    })

    const promise = downloadFile(config, fileItem, { signal: controller.signal, onProgress: () => {} })
    await reading
    controller.abort()

    expect(signalRef.aborted).toBe(true)
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('流式读取时按块回报进度', async () => {
    const onProgress = vi.fn()
    fetchMock.mockResolvedValueOnce(streamResponse([new Uint8Array([1, 2]), new Uint8Array([3])]))

    const blob = await downloadFile(config, { ...fileItem, size: 3 }, { onProgress })

    expect(onProgress).toHaveBeenNthCalledWith(1, 2, 3)
    expect(onProgress).toHaveBeenNthCalledWith(2, 3, 3)
    expect(blob.size).toBe(3)
    expect(blob.type).toBe('text/plain')
  })

  it('命中 Cache Storage 时不再发起网络请求', async () => {
    const cachedBlob = new Blob(['abc'])
    const match = vi.fn().mockResolvedValue({ blob: vi.fn().mockResolvedValue(cachedBlob) })
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue({ match }) })
    const onProgress = vi.fn()

    const result = await downloadFile(config, fileItem, { onProgress })

    expect(result).toBe(cachedBlob)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onProgress).toHaveBeenCalledWith(3, 3)
  })

  it('下载成功后写入缓存并清理同路径的旧版本', async () => {
    const cacheBase = `${location.origin}/__file-cache/user/repo/`
    const oldKey = `${cacheBase}old-sha/files/a.txt`
    const otherKey = `${cacheBase}sha-a/files/other.txt`
    const blob = new Blob(['fresh'])
    const put = vi.fn().mockResolvedValue(undefined)
    const del = vi.fn().mockResolvedValue(true)
    const match = vi.fn().mockImplementation(async request => {
      if (request?.url === oldKey) {
        return { headers: { get: () => encodeURIComponent('files/a.txt') } }
      }
      if (request?.url === otherKey) {
        return { headers: { get: () => encodeURIComponent('files/other.txt') } }
      }
      return null
    })
    const cache = {
      put,
      delete: del,
      keys: vi.fn().mockResolvedValue([{ url: oldKey }, { url: otherKey }, { url: `${cacheBase}sha-a/files/a.txt` }]),
      match,
    }
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue(cache) })
    fetchMock.mockResolvedValueOnce(blobResponse(blob))

    await downloadFile(config, fileItem)

    expect(put).toHaveBeenCalledTimes(1)
    const [putKey, putResponse] = put.mock.calls[0]
    expect(putKey).toBe(`${cacheBase}sha-a/files/a.txt`)
    expect(putResponse.headers.get('X-Relay-Path')).toBe(encodeURIComponent('files/a.txt'))
    expect(del).toHaveBeenCalledWith(expect.objectContaining({ url: oldKey }))
    expect(del).not.toHaveBeenCalledWith(expect.objectContaining({ url: otherKey }))
  })
})

describe('deleteEntry', () => {
  it('发送 DELETE 请求并携带 sha 与分支', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: vi.fn() })

    await deleteEntry(config, fileItem)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/user/repo/contents/files/a.txt')
    expect(init.method).toBe('DELETE')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({
      message: '删除文件：a.txt',
      sha: 'sha-a',
      branch: 'main',
    })
  })

  it('无分支时请求体不含 branch', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: vi.fn() })

    await deleteEntry({ ...config, branch: '' }, fileItem)

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      message: '删除文件：a.txt',
      sha: 'sha-a',
    })
  })

  it('删除失败时抛出映射提示', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { message: 'Conflict' }))
    await expect(deleteEntry(config, fileItem)).rejects.toThrow('操作冲突')
  })
})

describe('sanitizeFilename', () => {
  it('去掉路径只保留文件名', () => {
    expect(sanitizeFilename('a/b/c.txt')).toBe('c.txt')
    expect(sanitizeFilename('a\\b\\c.txt')).toBe('c.txt')
  })

  it('替换非法字符', () => {
    expect(sanitizeFilename('a<b>c:d"e|f?g*h.txt')).toBe('a_b_c_d_e_f_g_h.txt')
  })

  it('去掉前导点并去除首尾空白', () => {
    expect(sanitizeFilename('..hidden.txt')).toBe('hidden.txt')
    expect(sanitizeFilename('  a.txt  ')).toBe('a.txt')
  })

  it('空名回退为 file.txt', () => {
    expect(sanitizeFilename('')).toBe('file.txt')
    expect(sanitizeFilename('   ')).toBe('file.txt')
    expect(sanitizeFilename('...')).toBe('file.txt')
    expect(sanitizeFilename(null)).toBe('file.txt')
  })

  it('超长文件名截断但保留扩展名', () => {
    const result = sanitizeFilename(`${'a'.repeat(200)}.pdf`)
    expect(result).toHaveLength(160)
    expect(result.endsWith('.pdf')).toBe(true)
  })
})

describe('fileToBase64', () => {
  it('去掉 data URL 前缀，返回纯 base64', async () => {
    const file = new File(['hello'], 'a.txt', { type: 'text/plain' })
    await expect(fileToBase64(file)).resolves.toBe('aGVsbG8=')
  })

  it('读取失败时抛出提示', async () => {
    class FailingReader {
      readAsDataURL() {
        window.setTimeout(() => this.onerror?.(new Error('failed')), 0)
      }
    }
    vi.stubGlobal('FileReader', FailingReader)

    await expect(fileToBase64(new Blob(['x']))).rejects.toThrow('读取文件失败')
  })
})

describe('saveBlob', () => {
  it('创建临时链接触发下载，并在 2 秒后回收 Object URL', () => {
    vi.useFakeTimers()
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    let anchor
    const createElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation(tag => {
      const element = createElement(tag)
      if (tag === 'a') anchor = element
      return element
    })

    saveBlob(new Blob(['data']), 'a.txt')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(anchor.download).toBe('a.txt')
    expect(anchor.href).toBe('blob:mock')
    expect(click).toHaveBeenCalledTimes(1)
    expect(document.body.contains(anchor)).toBe(false)

    vi.advanceTimersByTime(1999)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
  })
})
