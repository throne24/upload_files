import { computed, reactive, ref } from 'vue'
import { config, isConfigured } from '../lib/config'
import { deleteEntry, downloadFile, listFileDates, listFiles, saveBlob } from '../lib/github'
import { toast } from '../lib/toast'

const CACHE_TTL = 60 * 1000

// 列表、进度与取消控制器放在模块级，文件库和管理台共用，切换路由不重复请求
const files = ref([])
const loading = ref(false)
const error = ref('')
const busyPaths = reactive(new Set())
const downloadStates = reactive(new Map())
const downloadControllers = new Map()

const configured = computed(() => isConfigured())
const fileCount = computed(() => files.value.length)

let lastLoadedAt = 0
let pendingReload = null
let reloadToken = 0

// force 为 true 时忽略缓存并重新请求；默认走缓存，避免切页时重复消耗 API 额度
async function load({ force = false } = {}) {
  if (!configured.value) {
    reloadToken += 1
    files.value = []
    error.value = ''
    loading.value = false
    lastLoadedAt = 0
    pendingReload = null
    return
  }

  if (!force) {
    if (pendingReload) return pendingReload
    if (error.value) return
    if (lastLoadedAt && Date.now() - lastLoadedAt < CACHE_TTL) return
  }

  const token = ++reloadToken
  loading.value = true
  error.value = ''

  pendingReload = (async () => {
    try {
      const [list, dates] = await Promise.all([
        listFiles(config),
        listFileDates(config).catch(() => new Map()),
      ])
      if (token !== reloadToken) return
      files.value = list.map(item => {
        const date = dates.get(item.name)
        return date ? { ...item, updated_at: date } : item
      })
      lastLoadedAt = Date.now()
    } catch (e) {
      if (token !== reloadToken) return
      error.value = e?.message || '加载文件列表失败'
      files.value = []
      lastLoadedAt = 0
    } finally {
      if (token === reloadToken) {
        loading.value = false
        pendingReload = null
      }
    }
  })()

  return pendingReload
}

function reload() {
  return load({ force: true })
}

function ensureLoaded() {
  return load()
}

async function download(item) {
  if (busyPaths.has(item.path)) return
  const controller = new AbortController()
  downloadControllers.set(item.path, controller)
  busyPaths.add(item.path)
  const startedAt = performance.now()
  downloadStates.set(item.path, { received: 0, total: item.size || 0, percent: 0, speed: 0 })
  try {
    const blob = await downloadFile(config, item, {
      signal: controller.signal,
      onProgress: (received, total) => {
        const state = downloadStates.get(item.path)
        if (!state) return
        const expected = total || item.size || 0
        const elapsed = (performance.now() - startedAt) / 1000
        state.received = received
        state.total = expected
        state.percent = expected ? Math.min(100, Math.round((received / expected) * 100)) : 0
        state.speed = elapsed > 0 ? received / elapsed : 0
      },
    })
    saveBlob(blob, item.name)
    toast(`已开始下载「${item.name}」`, 'success')
  } catch (e) {
    if (e?.name === 'AbortError') {
      toast(`已取消下载「${item.name}」`, 'info')
    } else {
      toast(`下载失败：${e?.message || '未知错误'}`, 'error')
    }
  } finally {
    downloadControllers.delete(item.path)
    downloadStates.delete(item.path)
    busyPaths.delete(item.path)
  }
}

function cancelDownload(item) {
  downloadControllers.get(item.path)?.abort()
}

async function removeFile(item, onNeedConfig) {
  if (busyPaths.has(item.path)) return
  if (!config.token) {
    toast('删除文件需要先在「仓库设置」中填写令牌', 'error')
    onNeedConfig?.()
    return
  }
  if (!window.confirm(`确定从仓库删除「${item.name}」吗？删除后不可恢复。`)) return
  busyPaths.add(item.path)
  try {
    await deleteEntry(config, item)
    files.value = files.value.filter(file => file.path !== item.path)
    toast('文件已删除', 'success')
  } catch (e) {
    toast(`删除失败：${e?.message || '未知错误'}`, 'error')
  } finally {
    busyPaths.delete(item.path)
  }
}

export function useFileList({ onNeedConfig } = {}) {
  async function remove(item) {
    return removeFile(item, onNeedConfig)
  }

  return {
    files,
    loading,
    error,
    busyPaths,
    downloadStates,
    configured,
    fileCount,
    reload,
    ensureLoaded,
    download,
    cancelDownload,
    remove,
  }
}
