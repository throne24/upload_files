<script setup>
import { computed, ref, shallowRef, watch } from 'vue'
import { config } from '../lib/config'
import { downloadFile, saveBlob } from '../lib/github'
import { extensionLabel, extensionOf, isPreviewable } from '../lib/filetypes'

const props = defineProps({
  open: { type: Boolean, default: false },
  item: { type: Object, default: null },
})

const emit = defineEmits(['update:open'])

const dialogRef = ref(null)
const loading = ref(false)
const error = ref('')
const mode = ref('empty')
const textContent = ref('')
const docxHtml = ref('')
const sheetHtml = ref('')
const sheetNote = ref('')
const sheetNames = ref([])
const activeSheet = ref('')
const pdfUrl = ref('')
const previewBlob = shallowRef(null)
const stage = ref('download')
const progress = ref({ received: 0, total: 0 })
let loadController = null
let workbook = null

const badge = computed(() => extensionLabel(props.item?.name))

const loadingText = computed(() => {
  if (stage.value === 'parse') return '正在解析文档…'
  const { received, total } = progress.value
  if (!received) return '正在下载文件…'
  const expected = total || props.item?.size || 0
  if (!expected) return `正在下载文件… ${formatSize(received)}`
  const percent = Math.min(100, Math.round((received / expected) * 100))
  return `正在下载文件… ${percent}% · ${formatSize(received)} / ${formatSize(expected)}`
})

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

watch(
  () => [props.open, props.item],
  ([isOpen, item]) => {
    if (isOpen && item) {
      reset()
      if (dialogRef.value && !dialogRef.value.open) dialogRef.value.showModal()
      load(item)
    } else if (!isOpen && dialogRef.value?.open) {
      dialogRef.value.close()
    }
  },
)

function abortLoad() {
  if (!loadController) return
  loadController.abort()
  loadController = null
}

function reset() {
  abortLoad()
  loading.value = true
  stage.value = 'download'
  progress.value = { received: 0, total: 0 }
  error.value = ''
  mode.value = 'empty'
  textContent.value = ''
  docxHtml.value = ''
  sheetHtml.value = ''
  sheetNote.value = ''
  sheetNames.value = []
  activeSheet.value = ''
  workbook = null
  previewBlob.value = null
  if (pdfUrl.value) {
    URL.revokeObjectURL(pdfUrl.value)
    pdfUrl.value = ''
  }
}

function cleanup() {
  abortLoad()
  if (pdfUrl.value) {
    URL.revokeObjectURL(pdfUrl.value)
    pdfUrl.value = ''
  }
  previewBlob.value = null
  docxHtml.value = ''
  sheetHtml.value = ''
  sheetNote.value = ''
  textContent.value = ''
  workbook = null
}

function decodeText(buffer) {
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  if (!utf8.includes('\uFFFD')) return utf8
  try {
    return new TextDecoder('gbk').decode(buffer)
  } catch {
    return utf8
  }
}

async function load(item) {
  const controller = new AbortController()
  loadController = controller
  try {
    if (!isPreviewable(item.name)) {
      mode.value = 'unsupported'
      loading.value = false
      return
    }

    const blob = await downloadFile(config, item, {
      signal: controller.signal,
      onProgress: (received, total) => {
        progress.value = { received, total }
      },
    })
    previewBlob.value = blob
    const ext = extensionOf(item.name)

    if (ext === 'txt' || ext === 'md' || ext === 'csv') {
      textContent.value = decodeText(await blob.arrayBuffer())
      mode.value = 'text'
      return
    }

    if (ext === 'docx') {
      stage.value = 'parse'
      const buffer = await blob.arrayBuffer()
      const mammothModule = await import('mammoth/mammoth.browser.js')
      const mammoth = mammothModule.default || mammothModule
      const purifyModule = await import('dompurify')
      const purify = purifyModule.default
      const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
      docxHtml.value = purify.sanitize(result.value, { USE_PROFILES: { html: true } })
      mode.value = 'docx'
      return
    }

    if (ext === 'xls' || ext === 'xlsx') {
      stage.value = 'parse'
      const buffer = await blob.arrayBuffer()
      const xlsxModule = await import('xlsx')
      const XLSX = xlsxModule.default || xlsxModule
      workbook = XLSX.read(buffer, { type: 'array' })
      sheetNames.value = workbook.SheetNames
      if (workbook.SheetNames.length) {
        renderSheet(workbook.SheetNames[0])
      }
      mode.value = 'sheet'
      return
    }

    if (ext === 'pdf') {
      pdfUrl.value = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
      mode.value = 'pdf'
      return
    }

    mode.value = 'unsupported'
  } catch (e) {
    if (e?.name === 'AbortError') return
    error.value = e?.message || '预览失败'
    mode.value = 'error'
  } finally {
    if (loadController === controller) {
      loadController = null
      loading.value = false
    }
  }
}

async function renderSheet(name) {
  if (!workbook) return
  activeSheet.value = name
  sheetNote.value = ''
  sheetHtml.value = ''
  const sheet = workbook.Sheets[name]
  if (!sheet) {
    sheetNote.value = '该工作表为空。'
    return
  }
  try {
    const xlsxModule = await import('xlsx')
    const XLSX = xlsxModule.default || xlsxModule
    const purifyModule = await import('dompurify')
    const purify = purifyModule.default
    sheetHtml.value = purify.sanitize(XLSX.utils.sheet_to_html(sheet), {
      USE_PROFILES: { html: true },
    })
    if (!sheetHtml.value) {
      sheetNote.value = '该工作表没有可显示的内容。'
    }
  } catch {
    sheetNote.value = '该工作表没有可显示的内容，建议下载原文件查看。'
  }
}

function closeDialog() {
  dialogRef.value?.close()
}

function onNativeClose() {
  cleanup()
  emit('update:open', false)
}

function onBackdropClick(event) {
  if (event.target === dialogRef.value) closeDialog()
}

function downloadPreview() {
  if (!previewBlob.value || !props.item) return
  saveBlob(previewBlob.value, props.item.name)
}
</script>

<template>
  <dialog ref="dialogRef" class="preview-dialog" @close="onNativeClose" @click="onBackdropClick">
    <div class="preview-shell">
      <header class="preview-head">
        <div class="head-info">
          <span class="file-badge" aria-hidden="true">{{ badge }}</span>
          <div class="head-text">
            <h2 :title="item?.name || ''">{{ item?.name }}</h2>
            <p>在线预览 · 排版可能与原文件略有差异</p>
          </div>
        </div>
        <button type="button" class="close-btn" aria-label="关闭预览" @click="closeDialog">×</button>
      </header>

      <div class="preview-body">
        <div v-if="loading" class="state">
          <span class="spinner" aria-hidden="true"></span>
          {{ loadingText }}
        </div>
        <div v-else-if="mode === 'error'" class="state error">{{ error }}</div>
        <div v-else-if="mode === 'unsupported'" class="state">该格式暂不支持在线预览，请下载后查看。</div>
        <pre v-else-if="mode === 'text'" class="text-preview">{{ textContent }}</pre>
        <div v-else-if="mode === 'docx'" class="rich-preview" v-html="docxHtml"></div>
        <div v-else-if="mode === 'sheet'" class="sheet-preview">
          <div v-if="sheetNames.length > 1" class="sheet-tabs">
            <button
              v-for="name in sheetNames"
              :key="name"
              type="button"
              class="sheet-tab"
              :class="{ active: name === activeSheet }"
              @click="renderSheet(name)"
            >
              {{ name }}
            </button>
          </div>
          <div class="sheet-scroll">
            <p v-if="sheetNote" class="sheet-empty">{{ sheetNote }}</p>
            <div v-else v-html="sheetHtml"></div>
          </div>
        </div>
        <iframe v-else-if="mode === 'pdf'" :src="pdfUrl" class="pdf-preview" title="PDF 预览"></iframe>
      </div>

      <footer class="preview-foot">
        <span class="foot-hint">预览不改变原文件，下载后可用本地软件打开</span>
        <div class="foot-actions">
          <button type="button" class="btn ghost small" :disabled="!previewBlob" @click="downloadPreview">
            下载原文件
          </button>
          <button type="button" class="btn primary small" @click="closeDialog">关闭</button>
        </div>
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.preview-dialog {
  width: min(920px, calc(100vw - 40px));
  height: min(86vh, 900px);
  margin: auto;
  padding: 0;
  border: none;
  border-radius: 20px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 32px 90px -24px rgba(15, 23, 42, 0.55);
  overflow: hidden;
}

.preview-dialog::backdrop {
  background: rgba(15, 23, 42, 0.48);
  backdrop-filter: blur(3px);
}

.preview-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.preview-head {
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
}

.head-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.file-badge {
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  background: linear-gradient(150deg, #eef2ff 0%, #e8ecff 100%);
  color: var(--accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.05em;
}

.head-text {
  min-width: 0;
}

.head-text h2 {
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.head-text p {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-3);
}

.close-btn {
  flex: none;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--surface-soft);
  color: var(--text-2);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}

.close-btn:hover {
  background: #eef1f6;
  color: var(--text);
}

.preview-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: #f6f8fc;
  display: flex;
  flex-direction: column;
}

.state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 24px;
  color: var(--text-2);
  font-size: 14px;
  text-align: center;
}

.state.error {
  color: #b91c1c;
  background: var(--danger-soft);
  white-space: pre-wrap;
}

.text-preview {
  flex: 1;
  margin: 0;
  padding: 22px 26px;
  background: var(--surface);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13.5px;
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.rich-preview {
  flex: 1;
  background: var(--surface);
  padding: 28px 36px;
  font-size: 14px;
  line-height: 1.75;
}

.rich-preview :deep(h1) {
  margin: 0 0 16px;
  font-size: 22px;
  line-height: 1.35;
}

.rich-preview :deep(h2) {
  margin: 22px 0 12px;
  font-size: 18px;
}

.rich-preview :deep(h3) {
  margin: 18px 0 10px;
  font-size: 16px;
}

.rich-preview :deep(p) {
  margin: 0 0 12px;
}

.rich-preview :deep(ul),
.rich-preview :deep(ol) {
  margin: 0 0 12px;
  padding-left: 24px;
}

.rich-preview :deep(img) {
  max-width: 100%;
  height: auto;
}

.rich-preview :deep(table) {
  width: 100%;
  margin: 12px 0;
  border-collapse: collapse;
}

.rich-preview :deep(td),
.rich-preview :deep(th) {
  padding: 6px 10px;
  border: 1px solid #dfe4ee;
  vertical-align: top;
}

.rich-preview :deep(a) {
  color: var(--accent);
}

.sheet-preview {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--surface);
}

.sheet-tabs {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-soft);
}

.sheet-tab {
  padding: 5px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  font-size: 12.5px;
  cursor: pointer;
}

.sheet-tab.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.sheet-scroll {
  flex: 1;
  overflow: auto;
  padding: 4px 10px 18px;
}

.sheet-empty {
  margin: 0;
  padding: 40px 16px;
  text-align: center;
  font-size: 13.5px;
  color: var(--text-2);
}

.sheet-scroll :deep(table) {
  border-collapse: collapse;
  font-size: 12.5px;
}

.sheet-scroll :deep(td),
.sheet-scroll :deep(th) {
  padding: 4px 8px;
  border: 1px solid #e3e8ef;
  white-space: nowrap;
  vertical-align: top;
}

.pdf-preview {
  flex: 1;
  width: 100%;
  min-height: 560px;
  border: none;
  background: #e9edf5;
}

.preview-foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid var(--line);
  background: var(--surface);
}

.foot-hint {
  font-size: 12px;
  color: var(--text-3);
}

.foot-actions {
  flex: none;
  display: flex;
  gap: 8px;
}

@media (max-width: 640px) {
  .preview-dialog {
    width: calc(100vw - 20px);
    height: 88vh;
  }

  .preview-head {
    padding: 13px 16px;
  }

  .rich-preview {
    padding: 18px;
  }

  .foot-hint {
    display: none;
  }

  .preview-foot {
    justify-content: flex-end;
  }
}
</style>
