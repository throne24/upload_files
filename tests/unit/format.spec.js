import { describe, expect, it } from 'vitest'
import { formatDate, formatSize, formatSpeed } from '../../src/lib/format'

describe('formatSize', () => {
  it('按 B、KB、MB 分段显示', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(1023)).toBe('1023 B')
    expect(formatSize(1024)).toBe('1.0 KB')
    expect(formatSize(1536)).toBe('1.5 KB')
    expect(formatSize(1024 * 1024)).toBe('1.00 MB')
    expect(formatSize(1.25 * 1024 * 1024)).toBe('1.25 MB')
  })

  it('非数字返回空串', () => {
    expect(formatSize(undefined)).toBe('')
    expect(formatSize(null)).toBe('')
    expect(formatSize(Number.NaN)).toBe('')
    expect(formatSize('1024')).toBe('')
  })
})

describe('formatDate', () => {
  it('格式化为 YYYY/MM/DD HH:mm', () => {
    const date = new Date(2026, 0, 2, 3, 4)
    expect(formatDate(date)).toBe('2026/01/02 03:04')
  })

  it('补零到两位', () => {
    expect(formatDate(new Date(2026, 10, 9, 14, 11))).toBe('2026/11/09 14:11')
  })

  it('无效日期返回空串', () => {
    expect(formatDate('')).toBe('')
    expect(formatDate('not-a-date')).toBe('')
    expect(formatDate(undefined)).toBe('')
  })
})

describe('formatSpeed', () => {
  it('按 B/s、KB/s、MB/s 分段显示', () => {
    expect(formatSpeed(512)).toBe('512 B/s')
    expect(formatSpeed(2048)).toBe('2 KB/s')
    expect(formatSpeed(1024 * 1024)).toBe('1.0 MB/s')
  })

  it('非正数与非法值返回空串', () => {
    expect(formatSpeed(0)).toBe('')
    expect(formatSpeed(-1)).toBe('')
    expect(formatSpeed(Number.NaN)).toBe('')
    expect(formatSpeed(undefined)).toBe('')
  })
})
