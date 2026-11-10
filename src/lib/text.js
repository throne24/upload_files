// 优先按 UTF-8 解码；出现替换字符说明可能是 GBK 等中文编码，尝试回退
export function decodeText(buffer) {
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  if (!utf8.includes('\uFFFD')) return utf8
  try {
    return new TextDecoder('gbk').decode(buffer)
  } catch {
    return utf8
  }
}
