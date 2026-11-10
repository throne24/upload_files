import { computed, ref, watch } from 'vue'
import { FILE_CATEGORIES, categoryOf } from '../lib/filetypes'

const SORT_OPTIONS = [
  { key: 'recent', label: '最近更新', title: '按更新时间从新到旧' },
  { key: 'name', label: '名称', title: '按文件名排序' },
  { key: 'size', label: '大小', title: '按文件大小从大到小' },
]

const DEFAULT_SORT = 'recent'

// 搜索、排序与分类筛选的数据计算；面板交互由 FileToolbar 自己维护
export function useFileFilter({ files, mode }) {
  const query = ref('')
  const sortKey = ref(DEFAULT_SORT)
  const activeCategory = ref('all')

  const visibleFiles = computed(() => {
    const keyword = query.value.trim().toLowerCase()
    if (!keyword) return files.value
    return files.value.filter(file => String(file.name).toLowerCase().includes(keyword))
  })

  const categoryCounts = computed(() => {
    const counts = new Map()
    for (const file of visibleFiles.value) {
      const key = categoryOf(file.name)
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return counts
  })

  const availableCategories = computed(() =>
    FILE_CATEGORIES.filter(category => categoryCounts.value.get(category.key) > 0),
  )

  watch(availableCategories, categories => {
    if (activeCategory.value !== 'all' && !categories.some(category => category.key === activeCategory.value)) {
      activeCategory.value = 'all'
    }
  })

  function sortFiles(list) {
    const items = [...list]
    if (sortKey.value === 'name') {
      items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh-CN', { numeric: true }))
    } else if (sortKey.value === 'size') {
      items.sort((a, b) => (b.size || 0) - (a.size || 0))
    } else {
      items.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    }
    return items
  }

  const displayGroups = computed(() => {
    if (mode.value === 'manage') {
      return [{ key: 'all', label: '', items: sortFiles(visibleFiles.value) }]
    }
    const categories =
      activeCategory.value === 'all'
        ? availableCategories.value
        : availableCategories.value.filter(category => category.key === activeCategory.value)
    return categories
      .map(category => ({
        ...category,
        items: sortFiles(visibleFiles.value.filter(file => categoryOf(file.name) === category.key)),
      }))
      .filter(group => group.items.length > 0)
  })

  return {
    query,
    sortKey,
    activeCategory,
    SORT_OPTIONS,
    visibleFiles,
    categoryCounts,
    availableCategories,
    displayGroups,
  }
}
