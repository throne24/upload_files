<script setup>
import { reactive, ref } from 'vue'
import { canWrite, config } from '../lib/config'
import { fileToBase64, getEntry, sanitizeFilename, uploadFile } from '../lib/github'
import { toast } from '../lib/toast'

const emit = defineEmits(['uploaded', 'need-config'])

// 支持的文档类型
const ALLOWED_PATTERN = /\.(txt|md|doc|docx|pdf|xls|xlsx|ppt|pptx|csv)$/i

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

  const acceptedFiles = files.filter(file => ALLOWED_PATTERN.test(file.name))
  const ignored = files.length - acceptedFiles.length
  if (ignored > 0) {
    toast(`已忽略 ${ignored} 个不支持的文件`, 'error')
  }

  for (const file of acceptedFiles) {
    const item = reactive({
      id: ++seed,
      name: file.name,
      status: 'uploading',
      message: '准备上传…',
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

  try {
    item.message = '检查同名文件…'
    const existing = await getEntry(config, path)
    if (existing && !window.confirm(`「${name}」已存在，是否覆盖？`)) {
      item.status = 'skipped'
      item.message = '已跳过，未覆盖'
      return
    }

    item.message = '上传中…'
    const base64 = await fileToBase64(file)
    await uploadFile(config, path, base64, existing?.sha)

    item.status = 'done'
    item.message = '已上传到仓库'
    toast(`「${name}」上传成功`, 'success')
  } catch (error) {
    item.status = 'error'
    item.message = error?.message || '上传失败'
    toast(`「${file.name}」上传失败：${item.message}`, 'error')
  }
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
      accept=".txt,.md,.doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx,.csv"
      multiple
      @change="onInputChange"
    />

    <ul v-if="queue.length" class="queue">
      <li v-for="item in queue" :key="item.id" class="queue-item" :class="item.status">
        <span class="queue-name" :title="item.name">{{ item.name }}</span>
        <span class="queue-status">
          <span v-if="item.status === 'uploading'" class="spinner" aria-hidden="true"></span>
          {{ item.message }}
        </span>
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
  padding: 38px 22px;
  border: 1.5px dashed #cfd6e4;
  border-radius: 14px;
  background: linear-gradient(180deg, #fbfcff 0%, #f7f9ff 100%);
  cursor: pointer;
  text-align: center;
  transition: border-color 0.18s ease, background 0.18s ease;
}

.drop-zone:hover,
.drop-zone:focus-visible {
  border-color: var(--accent);
  background: #f5f7ff;
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
  border-radius: 50%;
  background: #eef1ff;
  color: var(--accent);
}

.drop-title {
  font-size: 15px;
  font-weight: 600;
}

.drop-link {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 3px;
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
  border: 1px solid #edf0f6;
  border-radius: 10px;
  background: var(--surface-soft);
  font-size: 13px;
}

.queue-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-status {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 62%;
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
    gap: 4px;
  }

  .queue-status {
    max-width: 100%;
    text-align: left;
  }
}
</style>
