<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  title: { type: String, default: '' },
  mode: { type: String, default: 'manage' },
  total: { type: Number, default: 0 },
  visibleCount: { type: Number, default: 0 },
  configured: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  sortOptions: { type: Array, default: () => [] },
  availableCategories: { type: Array, default: () => [] },
  categoryCounts: { type: Map, default: () => new Map() },
})

const emit = defineEmits(['reload'])

const query = defineModel('query', { type: String, default: '' })
const sortKey = defineModel('sortKey', { type: String, default: 'recent' })
const activeCategory = defineModel('activeCategory', { type: String, default: 'all' })

const DEFAULT_SORT = 'recent'

const filterOpen = ref(false)
const filterButton = ref(null)
const filterPanel = ref(null)
const searchInput = ref(null)

const filterActive = computed(() => query.value.trim() !== '' || sortKey.value !== DEFAULT_SORT)

const activeSortLabel = computed(
  () => props.sortOptions.find(option => option.key === sortKey.value)?.label || '',
)

const filterSummary = computed(() => {
  const parts = []
  if (query.value.trim()) parts.push(query.value.trim())
  if (sortKey.value !== DEFAULT_SORT) parts.push(`按${activeSortLabel.value}`)
  return parts.join(' · ')
})

const countText = computed(() => (query.value.trim() ? props.visibleCount : props.total))

async function toggleFilter() {
  filterOpen.value = !filterOpen.value
  if (!filterOpen.value) return
  await nextTick()
  searchInput.value?.focus()
}

function resetFilter() {
  query.value = ''
  sortKey.value = DEFAULT_SORT
}

function onOutsidePointerDown(event) {
  if (!filterOpen.value) return
  if (filterPanel.value?.contains(event.target) || filterButton.value?.contains(event.target)) return
  filterOpen.value = false
}

function onEscape(event) {
  if (event.key !== 'Escape' || !filterOpen.value) return
  filterOpen.value = false
  filterButton.value?.focus()
}

onMounted(() => {
  document.addEventListener('pointerdown', onOutsidePointerDown)
  document.addEventListener('keydown', onEscape)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutsidePointerDown)
  document.removeEventListener('keydown', onEscape)
})
</script>

<template>
  <div class="card-head">
    <div class="head-left">
      <h2>{{ title }}</h2>
      <span v-if="total && mode === 'manage'" class="count">{{ countText }}</span>
    </div>
    <div class="head-actions">
      <button
        v-if="configured && total"
        ref="filterButton"
        type="button"
        class="btn ghost small filter-btn"
        :class="{ active: filterActive }"
        aria-controls="file-filter-panel"
        :aria-expanded="filterOpen"
        @click="toggleFilter"
      >
        筛选
        <span v-if="filterActive" class="filter-dot" aria-hidden="true"></span>
      </button>
      <button
        type="button"
        class="btn ghost small"
        :disabled="loading || !configured"
        @click="emit('reload')"
      >
        <span v-if="loading" class="spinner" aria-hidden="true"></span>
        {{ loading ? '加载中' : '刷新' }}
      </button>
    </div>

    <div
      v-if="configured && total"
      v-show="filterOpen"
      id="file-filter-panel"
      ref="filterPanel"
      class="filter-panel"
      role="group"
      aria-label="筛选"
    >
      <p class="filter-title">筛选</p>

      <div class="search-box">
        <input
          ref="searchInput"
          v-model="query"
          type="text"
          class="search-input"
          placeholder="搜索文件名…"
          aria-label="搜索文件名"
        />
        <button
          v-if="query"
          type="button"
          class="search-clear"
          aria-label="清空搜索"
          @click="query = ''"
        >
          ×
        </button>
      </div>

      <div class="filter-row">
        <span class="filter-label">排序</span>
        <div class="sort-group" role="group" aria-label="排序方式">
          <button
            v-for="option in sortOptions"
            :key="option.key"
            type="button"
            class="sort-btn"
            :class="{ active: sortKey === option.key }"
            :aria-pressed="sortKey === option.key"
            :title="option.title"
            @click="sortKey = option.key"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div v-if="filterActive" class="filter-foot">
        <span>{{ query.trim() ? `匹配 ${visibleCount} 个文件` : `当前按${activeSortLabel}` }}</span>
        <button type="button" class="filter-reset" @click="resetFilter">清空筛选</button>
      </div>
    </div>
  </div>

  <div v-if="filterActive && !filterOpen" class="filter-summary">
    <span class="filter-summary-text">{{ filterSummary }}</span>
    <button type="button" class="filter-summary-clear" aria-label="清空筛选" @click="resetFilter">
      ×
    </button>
  </div>

  <div v-if="mode === 'browse' && total" class="category-bar" aria-label="按文件类型筛选">
    <button
      type="button"
      class="category-chip"
      :class="{ active: activeCategory === 'all' }"
      :aria-pressed="activeCategory === 'all'"
      @click="activeCategory = 'all'"
    >
      全部 <span class="chip-count">{{ countText }}</span>
    </button>
    <button
      v-for="category in availableCategories"
      :key="category.key"
      type="button"
      class="category-chip"
      :class="{ active: activeCategory === category.key }"
      :aria-pressed="activeCategory === category.key"
      @click="activeCategory = category.key"
    >
      {{ category.label }}
      <span class="chip-count">{{ categoryCounts.get(category.key) }}</span>
    </button>
  </div>
</template>

<style scoped>
.card-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.head-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}

.head-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.head-left h2 {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.count {
  min-width: 24px;
  height: 22px;
  padding: 0 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: transparent;
  color: var(--text-3);
  font-family: var(--font-serif);
  font-size: 12px;
  font-weight: 600;
}

.filter-btn {
  position: relative;
}

.filter-btn.active {
  border-color: var(--accent);
  color: var(--accent);
}

.filter-dot {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}

.filter-panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 4;
  width: 300px;
  padding: 14px 16px 12px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--surface);
  box-shadow: 0 16px 34px -22px rgba(66, 52, 30, 0.55);
  animation: filter-in 0.16s ease-out;
}

.filter-panel::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 16px;
  width: 22px;
  height: 2px;
  background: var(--accent);
}

.filter-title {
  margin: 0 0 10px;
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--text-2);
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.filter-label {
  flex: none;
  font-size: 12px;
  color: var(--text-3);
}

.filter-row .search-box {
  width: 100%;
}

.filter-row .sort-group {
  flex: 1;
}

.filter-row .sort-btn {
  flex: 1;
  text-align: center;
  padding-inline: 4px;
}

.filter-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 11px;
  padding-top: 9px;
  border-top: 1px solid var(--line);
  font-size: 12px;
  color: var(--text-3);
}

.filter-reset {
  flex: none;
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  font-size: 12px;
  cursor: pointer;
}

.filter-reset:hover {
  color: var(--accent-2);
  text-decoration: underline;
}

.filter-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 9px;
  font-size: 12px;
  color: var(--text-3);
}

.filter-summary-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-summary-clear {
  flex: none;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border: none;
  background: none;
  padding: 0;
  color: var(--text-3);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.filter-summary-clear:hover {
  color: var(--accent);
}

@keyframes filter-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .filter-panel {
    animation: none;
  }
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 0;
}

.search-input {
  width: 100%;
  height: 32px;
  padding: 0 30px 0 11px;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13px;
}

.search-input::placeholder {
  color: var(--text-3);
}

.search-input:focus {
  outline: none;
  border-color: var(--accent);
}

.search-clear {
  position: absolute;
  top: 50%;
  right: 3px;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: none;
  background: none;
  color: var(--text-3);
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
}

.search-clear:hover {
  color: var(--accent);
}

.sort-group {
  flex: none;
  display: flex;
  gap: 2px;
}

.sort-btn {
  padding: 6px 9px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: none;
  color: var(--text-3);
  font-size: 12.5px;
  cursor: pointer;
  transition: color 0.16s ease, background 0.16s ease;
}

.sort-btn:hover {
  color: var(--accent);
}

.sort-btn.active {
  background: var(--surface-soft);
  border-color: var(--line);
  color: var(--text);
  font-weight: 600;
}

.category-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}

.category-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 12px;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.category-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.category-chip.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.chip-count {
  font-family: var(--font-serif);
  font-size: 11.5px;
  color: var(--text-3);
}

.category-chip.active .chip-count {
  color: var(--accent);
}

@media (max-width: 640px) {
  .card-head {
    flex-wrap: wrap;
  }

  /* 移动端改为就地内联展开：面板独占一行，向下推开内容 */
  .filter-panel {
    position: static;
    flex-basis: 100%;
    width: 100%;
    margin-top: 2px;
  }

  .filter-panel::before {
    display: none;
  }

  .filter-row .sort-btn {
    padding-inline: 2px;
  }
}
</style>
