<script setup>
import { computed } from 'vue'
import { extensionLabel, isPreviewable } from '../lib/filetypes'
import { formatDate, formatSize, formatSpeed } from '../lib/format'

const props = defineProps({
  item: { type: Object, required: true },
  mode: { type: String, default: 'manage' },
  busy: { type: Boolean, default: false },
  downloadState: { type: Object, default: null },
})

const emit = defineEmits(['preview', 'download', 'remove'])

const badge = computed(() => extensionLabel(props.item?.name))
const meta = computed(() => formatDate(props.item?.updated_at))
const downloadText = computed(() => {
  if (props.downloadState) return `${props.downloadState.percent}%`
  return props.busy ? '处理中…' : '下载'
})
</script>

<template>
  <li class="file-row">
    <span class="badge" aria-hidden="true">{{ badge }}</span>
    <div class="file-main">
      <span class="file-name" :title="item.name">{{ item.name }}</span>
      <span class="file-size">{{ formatSize(item.size) }}</span>
      <span v-if="meta" class="file-meta">{{ meta }}</span>
      <div v-if="downloadState" class="download-progress">
        <span class="bar"><span class="fill" :style="{ width: downloadState.percent + '%' }"></span></span>
        <span class="progress-text">
          {{ downloadState.percent }}% ·
          {{ formatSize(downloadState.received) }} / {{ formatSize(downloadState.total) }}
          <template v-if="formatSpeed(downloadState.speed)">
            · {{ formatSpeed(downloadState.speed) }}
          </template>
        </span>
      </div>
    </div>
    <div class="file-actions">
      <button
        v-if="isPreviewable(item.name)"
        type="button"
        class="btn ghost small"
        :disabled="busy"
        @click="emit('preview', item)"
      >
        预览
      </button>
      <button type="button" class="btn ghost small" :disabled="busy" @click="emit('download', item)">
        {{ downloadText }}
      </button>
      <button
        v-if="mode === 'manage'"
        type="button"
        class="btn danger small"
        :disabled="busy"
        @click="emit('remove', item)"
      >
        删除
      </button>
    </div>
  </li>
</template>

<style scoped>
.file-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 2px;
  border-top: 1px solid var(--line);
}

.file-row:first-child {
  border-top: none;
}

.badge {
  flex: none;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 3px;
  background: #fbf5e6;
  color: var(--text-2);
  font-family: var(--font-serif);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.file-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.file-name {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 12px;
  color: var(--text-3);
}

.file-meta {
  font-size: 12px;
  color: var(--text-3);
}

.download-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 5px;
}

.download-progress .bar {
  flex: 1;
  min-width: 60px;
  height: 6px;
  border: 1px solid var(--line);
  border-radius: 2px;
  background: var(--surface-soft);
  overflow: hidden;
}

.download-progress .fill {
  display: block;
  height: 100%;
  background: var(--accent);
  transition: width 0.2s ease;
}

.progress-text {
  flex: none;
  font-size: 11.5px;
  color: var(--text-3);
  white-space: nowrap;
}

.file-actions {
  flex: none;
  display: flex;
  gap: 8px;
}

@media (max-width: 640px) {
  .file-row {
    flex-wrap: wrap;
  }

  .file-main {
    flex-basis: calc(100% - 54px);
  }

  .file-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
