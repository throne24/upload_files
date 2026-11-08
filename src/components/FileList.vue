<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { config, isConfigured } from '../lib/config'
import { deleteEntry, downloadFile, listFiles } from '../lib/github'
import { toast } from '../lib/toast'

const emit = defineEmits(['need-config'])

const files = ref([])
const loading = ref(false)
const error = ref('')
const busyPaths = reactive(new Set())

const configured = computed(() => isConfigured())
const fileCount = computed(() => files.value.length)

onMounted(() => {
  if (configured.value) reload()
})

async function reload() {
  if (!configured.value) {
    files.value = []
    error.value = ''
    return
  }
  loading.value = true
  error.value = ''
  try {
    const list = await listFiles(config)
    files.value = list.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
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

async function download(item) {
  if (busyPaths.has(item.path)) return
  busyPaths.add(item.path)
  try {
    const blob = await downloadFile(config, item)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = item.name
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    toast(`已开始下载「${item.name}」`, 'success')
  } catch (e) {
    toast(`下载失败：${e?.message || '未知错误'}`, 'error')
  } finally {
    busyPaths.delete(item.path)
  }
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
        <h2>仓库文件</h2>
        <span v-if="fileCount" class="count">{{ fileCount }}</span>
      </div>
      <button type="button" class="btn ghost small" :disabled="loading || !configured" @click="reload">
        <span v-if="loading" class="spinner" aria-hidden="true"></span>
        {{ loading ? '加载中' : '刷新' }}
      </button>
    </div>

    <div v-if="!configured" class="empty">
      还没有配置仓库，<button type="button" class="text-link" @click="requestSetup">去配置</button>
    </div>

    <div v-else-if="error" class="error-box">
      <p>{{ error }}</p>
      <button type="button" class="btn ghost small" @click="reload">重试</button>
    </div>

    <div v-else-if="loading && !fileCount" class="empty">正在读取仓库文件…</div>

    <div v-else-if="!fileCount" class="empty">还没有文件，拖一个 .txt 到上方试试。</div>

    <ul v-else class="file-list">
      <li v-for="item in files" :key="item.path" class="file-row">
        <span class="badge" aria-hidden="true">{{ badgeOf(item.name) }}</span>
        <div class="file-main">
          <span class="file-name" :title="item.name">{{ item.name }}</span>
          <span class="file-meta">{{ formatSize(item.size) }} · {{ formatDate(item.updated_at) }}</span>
        </div>
        <div class="file-actions">
          <button
            type="button"
            class="btn ghost small"
            :disabled="busyPaths.has(item.path)"
            @click="download(item)"
          >
            {{ busyPaths.has(item.path) ? '处理中…' : '下载' }}
          </button>
          <button
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
  </section>
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
  font-size: 17px;
  letter-spacing: -0.01em;
}

.count {
  min-width: 26px;
  height: 22px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
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
  border: 1px solid #fecaca;
  border-radius: 12px;
  background: var(--danger-soft);
  color: #991b1b;
  font-size: 14px;
  line-height: 1.6;
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
  border-top: 1px solid #eff2f7;
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
  border-radius: 10px;
  background: linear-gradient(150deg, #eef2ff 0%, #e8ecff 100%);
  color: var(--accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.file-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-name {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  font-size: 12px;
  color: var(--text-3);
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
