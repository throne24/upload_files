import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissToast, toast, toasts } from '../../src/lib/toast'

beforeEach(() => {
  vi.useFakeTimers()
  toasts.splice(0)
})

afterEach(() => {
  vi.useRealTimers()
  toasts.splice(0)
})

describe('toast', () => {
  it('默认添加 info 提示，3 秒后自动移除', () => {
    toast('已保存')

    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ message: '已保存', type: 'info' })

    vi.advanceTimersByTime(2999)
    expect(toasts).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(toasts).toHaveLength(0)
  })

  it('错误提示保留 5 秒', () => {
    toast('上传失败', 'error')

    vi.advanceTimersByTime(4999)
    expect(toasts).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(toasts).toHaveLength(0)
  })

  it('多个提示各自计时，互不影响', () => {
    toast('普通提示')
    toast('错误提示', 'error')

    expect(toasts).toHaveLength(2)

    vi.advanceTimersByTime(3000)
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('错误提示')
  })

  it('可以手动关闭指定提示', () => {
    toast('手动关闭')
    dismissToast(toasts[0].id)

    expect(toasts).toHaveLength(0)
  })

  it('关闭不存在的提示时保持原样', () => {
    toast('保留')
    dismissToast(-1)

    expect(toasts).toHaveLength(1)
  })
})
