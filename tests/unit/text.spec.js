import { describe, expect, it } from 'vitest'
import { decodeText } from '../../src/lib/text'

const encoder = new TextEncoder()

describe('decodeText', () => {
  it('正常解码 UTF-8 中文', () => {
    const buffer = encoder.encode('你好，世界').buffer
    expect(decodeText(buffer)).toBe('你好，世界')
  })

  it('空 Buffer 返回空串', () => {
    expect(decodeText(new ArrayBuffer(0))).toBe('')
  })

  it('纯 ASCII 原样返回', () => {
    expect(decodeText(encoder.encode('hello world').buffer)).toBe('hello world')
  })

  it('UTF-8 解码出现替换字符时回退 GBK', () => {
    // “中文”的 GBK 编码：D6 D0 CE C4，按 UTF-8 解码必然产生替换字符
    const gbkBytes = new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]).buffer
    expect(decodeText(gbkBytes)).toBe('中文')
  })
})
