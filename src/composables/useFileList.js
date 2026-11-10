import { computed, reactive, ref } from 'vue'
import { config, isConfigured } from '../lib/config'
import { deleteEntry, downloadFile, listFileDates, listFiles, saveBlob } from '../lib/github'
import { toast } from '../lib/toast'

// 文件列表的数据加载、下载与删除逻辑；组件只负责展示
export function useFileList({ onNeedConfig } = {}) {
  const files = ref([])
  const loading = ref(false)
  const error = ref('')
  const busyPaths = reactive(new Set())
  const downloadStates = reactive(new Map())
  const downloadControllers = new Map()

  const configured = computed(() => isConfigured())
  const fileCount = computed(() => files.value.length)

  async function reload() {
    if (!configured.value) {
      files.value = []
      error.value = ''
      return
    }
    loading.value = true
    error.value = ''
    try {
      const [list, dates] = await Promise.all([
        listFiles(config),
        listFileDates(config).catch(() => new Map()),
      ])
      files.value = list.map(item => {
        const date = dates.get(item.name)
        return date ? { ...item, updated_at: date } : item
      })
    } catch (e) {
      error.value = e?.message || '加载文件列表失败'
      files.value = []
    } finally {
      loading.value = false
    }
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

  async function remove(item) {
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

  return {
    files,
    loading,
    error,
    busyPaths,
    downloadStates,
    configured,
    fileCount,
    reload,
    download,
    cancelDownload,
    remove,
  }
}
