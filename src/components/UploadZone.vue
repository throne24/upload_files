<script setup>
import { markRaw, reactive, ref } from 'vue'
import { canWrite, config } from '../lib/config'
import { ACCEPT_ATTRIBUTE, isAcceptedDocument } from '../lib/filetypes'
import { fileToBase64, getEntry, sanitizeFilename, uploadFile } from '../lib/github'
import { toast } from '../lib/toast'

const emit = defineEmits(['uploaded', 'need-config'])

const inputRef = ref(null)
const dragging = ref(false)
const queue = reactive([])
let dragDepth = 0
let seed = 0

function needsSetup() {
  return !canWrite()
}

function promptSetup() {
  emit('need-config')
}

function pick() {
  if (needsSetup()) {
    promptSetup()
    return
  }
  inputRef.value?.click()
}

function onInputChange(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (files.length) handleFiles(files)
}

function onDragEnter(event) {
  event.preventDefault()
  dragDepth += 1
  dragging.value = true
}

function onDragOver(event) {
  event.preventDefault()
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragging.value = false
}

function onDrop(event) {
  event.preventDefault()
  dragDepth = 0
  dragging.value = false
  const files = Array.from(event.dataTransfer?.files || [])
  if (files.length) handleFiles(files)
}

async function handleFiles(files) {
  if (needsSetup()) {
    promptSetup()
    return
  }

  const acceptedFiles = files.filter(file => isAcceptedDocument(file.name))
  const ignored = files.length - acceptedFiles.length
  if (ignored > 0) {
    toast(`已忽略 ${ignored} 个不支持的文件`, 'error')
  }

  for (const file of acceptedFiles) {
    const item = reactive({
      id: ++seed,
      name: file.name,
      file: markRaw(file),
      status: 'uploading',
      message: '准备上传…',
      percent: 0,
    })
    queue.push(item)
    await uploadOne(file, item)
  }

  if (acceptedFiles.length) {
    emit('uploaded')
  }
}

async function uploadOne(file, item) {
  const name = sanitizeFilename(file.name)
  const path = config.dir ? `${config.dir}/${name}` : name

  item.status = 'uploading'
  item.percent = 0
  item.message = '检查同名文件…'

  try {
    const existing = await getEntry(config, path)
    if (existing && !window.confirm(`「${name}」已存在，是否覆盖？`)) {
      item.status = 'skipped'
      item.message = '已跳过，未覆盖'
      return
    }

    item.message = '上传中…'
    const base64 = await fileToBase64(file)
    await uploadFile(config, path, base64, existing?.sha, {
      onProgress: (loaded, total) => {
        item.percent = total ? Math.min(100, Math.round((loaded / total) * 100)) : 0
        item.message = item.percent >= 100 ? '等待仓库确认…' : `上传中 ${item.percent}%`
      },
    })

    item.status = 'done'
    item.message = '已上传到仓库'
    toast(`「${name}」上传成功`, 'success')
  } catch (error) {
    item.status = 'error'
    item.message = error?.message || '上传失败'
    toast(`「${file.name}」上传失败：${item.message}`, 'error')
  }
}

function retry(item) {
  if (item.status !== 'error' || !item.file) return
  uploadOne(item.file, item)
}
</script>

<template>
  <section class="card upload-card">
    <div
      class="drop-zone"
      :class="{ dragging }"
      role="button"
      tabindex="0"
      aria-label="选择或拖拽文档上传"
      @click="pick"
      @keydown.enter.prevent="pick"
      @keydown.space.prevent="pick"
      @dragenter="onDragEnter"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <span class="drop-icon" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 16V5" />
          <path d="m7 10 5-5 5 5" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      </span>
      <p class="drop-title">拖拽文件到这里，或 <span class="drop-link">点击选择文件</span></p>
      <p class="drop-hint">支持 TXT、Word、PDF、Excel、PPT、Markdown、CSV，可一次选择多个</p>
    </div>

    <input
      ref="inputRef"
      class="hidden-input"
      type="file"
      :accept="ACCEPT_ATTRIBUTE"
      multiple
      @change="onInputChange"
    />

    <ul v-if="queue.length" class="queue">
      <li v-for="item in queue" :key="item.id" class="queue-item" :class="item.status">
        <div class="queue-main">
          <span class="queue-name" :title="item.name">{{ item.name }}</span>
          <span v-if="item.status === 'uploading'" class="queue-bar" aria-hidden="true">
            <span class="queue-fill" :style="{ width: item.percent + '%' }"></span>
          </span>
        </div>
        <div class="queue-side">
          <span class="queue-status">
            <span v-if="item.status === 'uploading'" class="spinner" aria-hidden="true"></span>
            {{ item.message }}
          </span>
          <button
            v-if="item.status === 'error'"
            type="button"
            class="btn ghost small"
            @click="retry(item)"
          >
            重试
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.upload-card {
  padding: 18px;
}

.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 22px;
  border: 1px dashed var(--line-strong);
  border-radius: 5px;
  background: #fbf7ec;
  cursor: pointer;
  text-align: center;
  transition: border-color 0.18s ease, background 0.18s ease;
}

.drop-zone:hover,
.drop-zone:focus-visible {
  border-color: var(--accent);
  background: #f9f2e4;
  outline: none;
}

.drop-zone.dragging {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.drop-icon {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface);
  color: var(--accent);
}

.drop-title {
  font-family: var(--font-serif);
  font-size: 15.5px;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.drop-link {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
}

.drop-hint {
  font-size: 12.5px;
  color: var(--text-3);
}

.hidden-input {
  display: none;
}

.queue {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.queue-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: #fbf7ec;
  font-size: 13px;
}

.queue-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.queue-bar {
  height: 4px;
  border: 1px solid var(--line);
  border-radius: 2px;
  background: var(--surface-soft);
  overflow: hidden;
}

.queue-fill {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.2s ease;
}

.queue-side {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  max-width: 62%;
}

.queue-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  text-align: right;
  overflow-wrap: anywhere;
  color: var(--text-2);
}

.queue-item.done .queue-status {
  color: var(--success);
}

.queue-item.error .queue-status {
  color: var(--danger);
}

.queue-item.skipped .queue-status {
  color: var(--warn);
}

@media (max-width: 520px) {
  .queue-item {
    flex-direction: column;
    gap: 8px;
  }

  .queue-side {
    max-width: 100%;
    width: 100%;
    justify-content: space-between;
  }

  .queue-status {
    text-align: left;
  }
}
</style>
