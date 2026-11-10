import { describe, expect, it } from 'vitest'
import {
  ACCEPTED_EXTENSIONS,
  ACCEPT_ATTRIBUTE,
  FILE_CATEGORIES,
  categoryOf,
  extensionLabel,
  extensionOf,
  isAcceptedDocument,
  isPreviewable,
} from '../../src/lib/filetypes'

describe('isAcceptedDocument', () => {
  it('接受上传白名单内的所有扩展名', () => {
    const names = [
      'a.txt',
      'a.md',
      'a.doc',
      'a.docx',
      'a.pdf',
      'a.xls',
      'a.xlsx',
      'a.ppt',
      'a.pptx',
      'a.csv',
    ]
    for (const name of names) {
      expect(isAcceptedDocument(name), name).toBe(true)
    }
  })

  it('大小写不敏感', () => {
    expect(isAcceptedDocument('REPORT.DOCX')).toBe(true)
    expect(isAcceptedDocument('数据.CSV')).toBe(true)
  })

  it('拒绝白名单外的格式、无扩展名和空值', () => {
    expect(isAcceptedDocument('photo.png')).toBe(false)
    expect(isAcceptedDocument('archive.zip')).toBe(false)
    expect(isAcceptedDocument('README')).toBe(false)
    expect(isAcceptedDocument('')).toBe(false)
    expect(isAcceptedDocument(null)).toBe(false)
  })
})

describe('isPreviewable', () => {
  it('可预览 txt、md、csv、docx、pdf、xls、xlsx', () => {
    for (const name of ['a.txt', 'a.md', 'a.csv', 'a.docx', 'a.pdf', 'a.xls', 'a.xlsx']) {
      expect(isPreviewable(name), name).toBe(true)
    }
  })

  it('doc、ppt、pptx 可上传但不可预览', () => {
    for (const name of ['a.doc', 'a.ppt', 'a.pptx']) {
      expect(isAcceptedDocument(name), name).toBe(true)
      expect(isPreviewable(name), name).toBe(false)
    }
  })

  it('未知格式与空值不可预览', () => {
    expect(isPreviewable('a.png')).toBe(false)
    expect(isPreviewable('README')).toBe(false)
    expect(isPreviewable(undefined)).toBe(false)
  })
})

describe('extensionOf', () => {
  it('返回小写扩展名', () => {
    expect(extensionOf('Report.DOCX')).toBe('docx')
    expect(extensionOf('a.PdF')).toBe('pdf')
  })

  it('多点文件名只取最后一段', () => {
    expect(extensionOf('a.b.docx')).toBe('docx')
    expect(extensionOf('v1.2.3.txt')).toBe('txt')
  })

  it('无扩展名或尾部点返回空串', () => {
    expect(extensionOf('README')).toBe('')
    expect(extensionOf('a.')).toBe('')
    expect(extensionOf('')).toBe('')
    expect(extensionOf(null)).toBe('')
  })
})

describe('extensionLabel', () => {
  it('返回大写标签', () => {
    expect(extensionLabel('a.docx')).toBe('DOCX')
    expect(extensionLabel('a.pdf')).toBe('PDF')
  })

  it('超过四个字符时截断', () => {
    expect(extensionLabel('a.xlsx')).toBe('XLSX')
    expect(extensionLabel('a.jpeg')).toBe('JPEG')
    expect(extensionLabel('a.verylong')).toBe('VERY')
  })

  it('无扩展名返回 FILE', () => {
    expect(extensionLabel('README')).toBe('FILE')
    expect(extensionLabel('')).toBe('FILE')
  })
})

describe('上传白名单常量', () => {
  it('扩展名列表与 accept 属性保持一致', () => {
    expect(ACCEPTED_EXTENSIONS).toEqual([
      'txt',
      'md',
      'doc',
      'docx',
      'pdf',
      'xls',
      'xlsx',
      'ppt',
      'pptx',
      'csv',
    ])
    expect(ACCEPT_ATTRIBUTE).toBe('.txt,.md,.doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx,.csv')
    for (const ext of ACCEPTED_EXTENSIONS) {
      expect(isAcceptedDocument(`file.${ext}`), ext).toBe(true)
    }
  })
})

describe('categoryOf', () => {
  it('按扩展名归类', () => {
    expect(categoryOf('a.doc')).toBe('document')
    expect(categoryOf('a.docx')).toBe('document')
    expect(categoryOf('a.xlsx')).toBe('sheet')
    expect(categoryOf('a.csv')).toBe('sheet')
    expect(categoryOf('a.ppt')).toBe('slides')
    expect(categoryOf('a.pdf')).toBe('pdf')
    expect(categoryOf('a.md')).toBe('text')
  })

  it('未知类型进入 other', () => {
    expect(categoryOf('a.png')).toBe('other')
    expect(categoryOf('README')).toBe('other')
  })

  it('分类键在 FILE_CATEGORIES 中都有定义', () => {
    const keys = FILE_CATEGORIES.map(category => category.key)
    for (const name of ['a.docx', 'a.xlsx', 'a.pptx', 'a.pdf', 'a.txt', 'a.png']) {
      expect(keys).toContain(categoryOf(name))
    }
  })
})
