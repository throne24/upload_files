// 允许上传的扩展名；.doc / .ppt / .pptx 仅支持下载
export const ACCEPTED_EXTENSIONS = ['txt', 'md', 'doc', 'docx', 'pdf', 'xls', 'xlsx', 'ppt', 'pptx', 'csv']

export const ACCEPTED_PATTERN = /\.(txt|md|doc|docx|pdf|xls|xlsx|ppt|pptx|csv)$/i

export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.map(ext => `.${ext}`).join(',')

export function isAcceptedDocument(name) {
  return ACCEPTED_PATTERN.test(String(name || ''))
}

// 可在线预览的扩展名；.doc / .ppt / .pptx 仅支持下载
export const PREVIEWABLE_PATTERN = /\.(txt|md|csv|docx|pdf|xls|xlsx)$/i

export function isPreviewable(name) {
  return PREVIEWABLE_PATTERN.test(String(name || ''))
}

export function extensionOf(name) {
  const parts = String(name || '').split('.')
  return parts.length > 1 ? parts.pop().toLowerCase() : ''
}

export function extensionLabel(name) {
  const ext = extensionOf(name)
  return ext ? ext.slice(0, 4).toUpperCase() : 'FILE'
}

// 文件库分类：按扩展名归类，未知类型统一进入「其他」
export const FILE_CATEGORIES = [
  { key: 'document', label: '文档' },
  { key: 'sheet', label: '表格' },
  { key: 'slides', label: '演示' },
  { key: 'pdf', label: 'PDF' },
  { key: 'text', label: '文本' },
  { key: 'other', label: '其他' },
]

const CATEGORY_BY_EXTENSION = {
  doc: 'document',
  docx: 'document',
  xls: 'sheet',
  xlsx: 'sheet',
  csv: 'sheet',
  ppt: 'slides',
  pptx: 'slides',
  pdf: 'pdf',
  txt: 'text',
  md: 'text',
}

export function categoryOf(name) {
  return CATEGORY_BY_EXTENSION[extensionOf(name)] || 'other'
}
