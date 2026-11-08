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
