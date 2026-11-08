<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { config, isConfigured } from '../lib/config'
import { FILE_CATEGORIES, categoryOf, isPreviewable } from '../lib/filetypes'
import { deleteEntry, downloadFile, listFileDates, listFiles, saveBlob } from '../lib/github'
import { toast } from '../lib/toast'
import PreviewDialog from './PreviewDialog.vue'

const props = defineProps({
  mode: { type: String, default: 'manage' },
})

const emit = defineEmits(['need-config'])

const files = ref([])
const loading = ref(false)
const error = ref('')
const busyPaths = reactive(new Set())
const downloadStates = reactive(new Map())
const previewOpen = ref(false)
const previewItem = ref(null)

const configured = computed(() => isConfigured())
const fileCount = computed(() => files.value.length)
const activeCategory = ref('all')
const query = ref('')
const sortKey = ref('recent')

const SORT_OPTIONS = [
  { key: 'recent', label: '最近更新', title: '按更新时间从新到旧' },
  { key: 'name', label: '名称', title: '按文件名排序' },
  { key: 'size', label: '大小', title: '按文件大小从大到小' },
]

const cardTitle = computed(() => (props.mode === 'browse' ? '文件目录' : '仓库文件'))

const visibleFiles = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return files.value
  return files.value.filter(file => String(file.name).toLowerCase().includes(keyword))
})

const categoryCounts = computed(() => {
  const counts = new Map()
  for (const file of visibleFiles.value) {
    const key = categoryOf(file.name)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
})

const availableCategories = computed(() =>
  FILE_CATEGORIES.filter(category => categoryCounts.value.get(category.key) > 0),
)

watch(availableCategories, categories => {
  if (activeCategory.value !== 'all' && !categories.some(category => category.key === activeCategory.value)) {
    activeCategory.value = 'all'
  }
})

function sortFiles(list) {
  const items = [...list]
  if (sortKey.value === 'name') {
    items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN', { numeric: true }))
  } else if (sortKey.value === 'size') {
    items.sort((a, b) => (b.size || 0) - (a.size || 0))
  } else {
    items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
  }
  return items
}

const displayGroups = computed(() => {
  if (props.mode === 'manage') {
    return [{ key: 'all', label: '', items: sortFiles(visibleFiles.value) }]
  }
  const categories =
    activeCategory.value === 'all'
      ? availableCategories.value
      : availableCategories.value.filter(category => category.key === activeCategory.value)
  return categories
    .map(category => ({
      ...category,
      items: sortFiles(visibleFiles.value.filter(file => categoryOf(file.name) === category.key)),
    }))
    .filter(group => group.items.length > 0)
})

onMounted(() => {
  if (configured.value) reload()
})

async function reload() {
  if (!configured.value) {
    files.value = []
    error.value = ''
    activeCategory.value = 'all'
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

defineExpose({ reload })

function requestSetup() {
  emit('need-config')
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function badgeOf(name) {
  const parts = String(name || '').split('.')
  return parts.length > 1 ? parts.pop().slice(0, 4).toUpperCase() : 'FILE'
}

function openPreview(item) {
  if (busyPaths.has(item.path)) return
  previewItem.value = item
  previewOpen.value = true
}

async function download(item) {
  if (busyPaths.has(item.path)) return
  busyPaths.add(item.path)
  const startedAt = performance.now()
  downloadStates.set(item.path, { received: 0, total: item.size || 0, percent: 0, speed: 0 })
  try {
    const blob = await downloadFile(config, item, {
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
    toast(`下载失败：${e?.message || '未知错误'}`, 'error')
  } finally {
    downloadStates.delete(item.path)
    busyPaths.delete(item.path)
  }
}

function downloadLabel(item) {
  const state = downloadStates.get(item.path)
  if (state) return `${state.percent}%`
  return busyPaths.has(item.path) ? '处理中…' : '下载'
}

function formatSpeed(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return ''
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
}

async function remove(item) {
  if (busyPaths.has(item.path)) return
  if (!config.token) {
    toast('删除文件需要先在「仓库设置」中填写令牌', 'error')
    requestSetup()
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
</script>

<template>
  <section class="card file-card">
    <div class="card-head">
      <div class="head-left">
        <h2>{{ cardTitle }}</h2>
        <span v-if="fileCount" class="count">{{ query.trim() ? visibleFiles.length : fileCount }}</span>
      </div>
      <button type="button" class="btn ghost small" :disabled="loading || !configured" @click="reload">
        <span v-if="loading" class="spinner" aria-hidden="true"></span>
        {{ loading ? '加载中' : '刷新' }}
      </button>
    </div>

    <div v-if="configured && fileCount" class="list-tools">
      <div class="search-box">
        <input
          v-model="query"
          type="text"
          class="search-input"
          placeholder="搜索文件名…"
          aria-label="搜索文件名"
        />
        <button
          v-if="query"
          type="button"
          class="search-clear"
          aria-label="清空搜索"
          @click="query = ''"
        >
          ×
        </button>
      </div>
      <div class="sort-group" role="group" aria-label="排序方式">
        <button
          v-for="option in SORT_OPTIONS"
          :key="option.key"
          type="button"
          class="sort-btn"
          :class="{ active: sortKey === option.key }"
          :aria-pressed="sortKey === option.key"
          :title="option.title"
          @click="sortKey = option.key"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <div v-if="mode === 'browse' && fileCount" class="category-bar" aria-label="按文件类型筛选">
      <button
        type="button"
        class="category-chip"
        :class="{ active: activeCategory === 'all' }"
        :aria-pressed="activeCategory === 'all'"
        @click="activeCategory = 'all'"
      >
        全部 <span class="chip-count">{{ query.trim() ? visibleFiles.length : fileCount }}</span>
      </button>
      <button
        v-for="category in availableCategories"
        :key="category.key"
        type="button"
        class="category-chip"
        :class="{ active: activeCategory === category.key }"
        :aria-pressed="activeCategory === category.key"
        @click="activeCategory = category.key"
      >
        {{ category.label }}
        <span class="chip-count">{{ categoryCounts.get(category.key) }}</span>
      </button>
    </div>

    <div v-if="!configured" class="empty">
      <template v-if="mode === 'manage'">
        还没有配置仓库，<button type="button" class="text-link" @click="requestSetup">去配置</button>
      </template>
      <template v-else>仓库尚未配置，暂时无法读取文件。</template>
    </div>

    <div v-else-if="error" class="error-box">
      <p>{{ error }}</p>
      <button type="button" class="btn ghost small" @click="reload">重试</button>
    </div>

    <div v-else-if="loading && !fileCount" class="empty">正在读取仓库文件…</div>

    <div v-else-if="!fileCount" class="empty">
      <template v-if="mode === 'manage'">还没有文件，拖一个文档到上方试试。</template>
      <template v-else>仓库里还没有文件。</template>
    </div>

    <div v-else-if="query.trim() && !visibleFiles.length" class="empty">
      没有找到与「{{ query.trim() }}」匹配的文件。
    </div>

    <div v-else-if="mode === 'browse' && !displayGroups.length" class="empty">
      该分类下暂无文件。
    </div>

    <div v-else class="file-groups">
      <div v-for="group in displayGroups" :key="group.key" class="file-group">
        <div v-if="mode === 'browse'" class="group-head">
          <h3>{{ group.label }}</h3>
          <span class="group-count">{{ group.items.length }}</span>
        </div>
        <ul class="file-list">
          <li v-for="item in group.items" :key="item.path" class="file-row">
            <span class="badge" aria-hidden="true">{{ badgeOf(item.name) }}</span>
            <div class="file-main">
              <span class="file-name" :title="item.name">{{ item.name }}</span>
              <span class="file-size">{{ formatSize(item.size) }}</span>
              <span v-if="formatDate(item.updated_at)" class="file-meta">
                {{ formatDate(item.updated_at) }}
              </span>
              <div v-if="downloadStates.has(item.path)" class="download-progress">
                <span class="bar"><span class="fill" :style="{ width: downloadStates.get(item.path).percent + '%' }"></span></span>
                <span class="progress-text">
                  {{ downloadStates.get(item.path).percent }}% ·
                  {{ formatSize(downloadStates.get(item.path).received) }} / {{ formatSize(downloadStates.get(item.path).total) }}
                  <template v-if="formatSpeed(downloadStates.get(item.path).speed)">
                    · {{ formatSpeed(downloadStates.get(item.path).speed) }}
                  </template>
                </span>
              </div>
            </div>
            <div class="file-actions">
              <button
                v-if="isPreviewable(item.name)"
                type="button"
                class="btn ghost small"
                :disabled="busyPaths.has(item.path)"
                @click="openPreview(item)"
              >
                预览
              </button>
              <button
                type="button"
                class="btn ghost small"
                :disabled="busyPaths.has(item.path)"
                @click="download(item)"
              >
                {{ downloadLabel(item) }}
              </button>
              <button
                v-if="mode === 'manage'"
                type="button"
                class="btn danger small"
                :disabled="busyPaths.has(item.path)"
                @click="remove(item)"
              >
                删除
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </section>

  <PreviewDialog v-model:open="previewOpen" :item="previewItem" />
</template>

<style scoped>
.file-card {
  padding: 20px 22px 22px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.head-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.head-left h2 {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.count {
  min-width: 24px;
  height: 22px;
  padding: 0 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: transparent;
  color: var(--text-3);
  font-family: var(--font-serif);
  font-size: 12px;
  font-weight: 600;
}

.list-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 0;
}

.search-input {
  width: 100%;
  height: 32px;
  padding: 0 30px 0 11px;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13px;
}

.search-input::placeholder {
  color: var(--text-3);
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
}

.search-clear {
  position: absolute;
  top: 50%;
  right: 3px;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: none;
  background: none;
  color: var(--text-3);
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
}

.search-clear:hover {
  color: var(--accent);
}

.sort-group {
  flex: none;
  display: flex;
  gap: 2px;
}

.sort-btn {
  padding: 6px 9px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: none;
  color: var(--text-3);
  font-size: 12.5px;
  cursor: pointer;
  transition: color 0.16s ease, background 0.16s ease;
}

.sort-btn:hover {
  color: var(--accent);
}

.sort-btn.active {
  background: var(--surface-soft);
  border-color: var(--line);
  color: var(--text);
  font-weight: 600;
}

.category-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}

.category-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 12px;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.category-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.category-chip.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.chip-count {
  font-family: var(--font-serif);
  font-size: 11.5px;
  color: var(--text-3);
}

.category-chip.active .chip-count {
  color: var(--accent);
}

.file-groups {
  margin-top: 16px;
}

.file-group .file-list {
  margin-top: 0;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 18px;
}

.group-head h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-serif);
  font-size: 14.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--text-2);
}

.group-head h3::before {
  content: '';
  width: 4px;
  height: 4px;
  background: var(--accent);
}

.group-count {
  font-family: var(--font-serif);
  font-size: 11.5px;
  color: var(--text-3);
}

.empty {
  padding: 30px 8px 26px;
  text-align: center;
  font-size: 14px;
  color: var(--text-2);
}

.text-link {
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.error-box {
  margin-top: 16px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #e2c3b7;
  border-radius: 4px;
  background: var(--danger-soft);
  color: #8f2f20;
  font-size: 14px;
  line-height: 1.65;
}

.file-list {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 2px;
  border-top: 1px solid var(--line);
}

.file-row:first-child {
  border-top: none;
}

.badge {
  flex: none;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: #fbf5e6;
  color: var(--text-2);
  font-family: var(--font-serif);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.file-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.file-name {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 12px;
  color: var(--text-3);
}

.file-meta {
  font-size: 12px;
  color: var(--text-3);
}

.download-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 5px;
}

.download-progress .bar {
  flex: 1;
  min-width: 60px;
  height: 6px;
  border: 1px solid var(--line);
  border-radius: 2px;
  background: var(--surface-soft);
  overflow: hidden;
}

.download-progress .fill {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.2s ease;
}

.progress-text {
  flex: none;
  font-size: 11.5px;
  color: var(--text-3);
  white-space: nowrap;
}

.file-actions {
  flex: none;
  display: flex;
  gap: 8px;
}

@media (max-width: 640px) {
  .file-card {
    padding: 18px 16px;
  }

  .list-tools {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .sort-group {
    justify-content: flex-end;
  }

  .file-row {
    flex-wrap: wrap;
  }

  .file-main {
    flex-basis: calc(100% - 54px);
  }

  .file-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
