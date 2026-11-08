import { reactive } from 'vue'

let seed = 0

export const toasts = reactive([])

export function toast(message, type = 'info') {
  const id = ++seed
  toasts.push({ id, message, type })
  window.setTimeout(() => dismissToast(id), type === 'error' ? 5000 : 3000)
}

export function dismissToast(id) {
  const index = toasts.findIndex(item => item.id === id)
  if (index !== -1) toasts.splice(index, 1)
}
