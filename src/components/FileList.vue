<script setup>
import { computed, onMounted, ref, toRef } from 'vue'
import { useFileFilter } from '../composables/useFileFilter'
import { useFileList } from '../composables/useFileList'
import FileRow from './FileRow.vue'
import FileToolbar from './FileToolbar.vue'
import PreviewDialog from './PreviewDialog.vue'

const props = defineProps({
  mode: { type: String, default: 'manage' },
})

const emit = defineEmits(['need-config'])

const modeRef = toRef(props, 'mode')

const {
  files,
  loading,
  error,
  busyPaths,
  downloadStates,
  configured,
  fileCount,
  reload,
  download,
  remove,
} = useFileList({ onNeedConfig: () => emit('need-config') })

const {
  query,
  sortKey,
  activeCategory,
  SORT_OPTIONS,
  visibleFiles,
  categoryCounts,
  availableCategories,
  displayGroups,
} = useFileFilter({ files, mode: modeRef })

const previewOpen = ref(false)
const previewItem = ref(null)

const cardTitle = computed(() => (props.mode === 'browse' ? '文件目录' : '仓库文件'))

onMounted(() => {
  if (configured.value) reload()
})

defineExpose({ reload })

function requestSetup() {
  emit('need-config')
}

function openPreview(item) {
  if (busyPaths.has(item.path)) return
  previewItem.value = item
  previewOpen.value = true
}
</script>

<template>
  <section class="card file-card">
    <FileToolbar
      v-model:query="query"
      v-model:sort-key="sortKey"
      v-model:active-category="activeCategory"
      :title="cardTitle"
      :mode="mode"
      :total="fileCount"
      :visible-count="visibleFiles.length"
      :configured="configured"
      :loading="loading"
      :sort-options="SORT_OPTIONS"
      :available-categories="availableCategories"
      :category-counts="categoryCounts"
      @reload="reload"
    />

    <div v-if="!configured" class="empty">
      <template v-if="mode === 'manage'">
        还没有配置仓库，<button type="button" class="text-link" @click="requestSetup">去配置</button>
      </template>
      <template v-else>仓库尚未配置，暂时无法读取文件。</template>
    </div>

    <div v-else-if="error" class="error-box">
      <p>{{ error }}</p>
      <button type="button" class="btn ghost small" @click="reload">重试</button>
    </div>

    <div v-else-if="loading && !fileCount" class="empty">正在读取仓库文件…</div>

    <div v-else-if="!fileCount" class="empty">
      <template v-if="mode === 'manage'">还没有文件，拖一个文档到上方试试。</template>
      <template v-else>仓库里还没有文件。</template>
    </div>

    <div v-else-if="query.trim() && !visibleFiles.length" class="empty">
      没有找到与「{{ query.trim() }}」匹配的文件。
    </div>

    <div v-else-if="mode === 'browse' && !displayGroups.length" class="empty">
      该分类下暂无文件。
    </div>

    <div v-else class="file-groups">
      <div v-for="group in displayGroups" :key="group.key" class="file-group">
        <div v-if="mode === 'browse'" class="group-head">
          <h3>{{ group.label }}</h3>
          <span class="group-count">{{ group.items.length }}</span>
        </div>
        <ul class="file-list">
          <FileRow
            v-for="item in group.items"
            :key="item.path"
            :item="item"
            :mode="mode"
            :busy="busyPaths.has(item.path)"
            :download-state="downloadStates.get(item.path)"
            @preview="openPreview"
            @download="download"
            @remove="remove"
          />
        </ul>
      </div>
    </div>
  </section>

  <PreviewDialog v-model:open="previewOpen" :item="previewItem" />
</template>

<style scoped>
.file-card {
  padding: 20px 22px 22px;
}

.file-groups {
  margin-top: 16px;
}

.file-group .file-list {
  margin-top: 0;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 18px;
}

.group-head h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-serif);
  font-size: 14.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--text-2);
}

.group-head h3::before {
  content: '';
  width: 4px;
  height: 4px;
  background: var(--accent);
}

.group-count {
  font-family: var(--font-serif);
  font-size: 11.5px;
  color: var(--text-3);
}

.empty {
  padding: 30px 8px 26px;
  text-align: center;
  font-size: 14px;
  color: var(--text-2);
}

.text-link {
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.error-box {
  margin-top: 16px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #e2c3b7;
  border-radius: 4px;
  background: var(--danger-soft);
  color: #8f2f20;
  font-size: 14px;
  line-height: 1.65;
}

.file-list {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
}

@media (max-width: 640px) {
  .file-card {
    padding: 18px 16px;
  }
}
</style>
