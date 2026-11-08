<script setup>
import { computed, onMounted, ref } from 'vue'
import FileList from '../components/FileList.vue'
import SettingsDialog from '../components/SettingsDialog.vue'
import UploadZone from '../components/UploadZone.vue'
import { isConfigured } from '../lib/config'
import { toast } from '../lib/toast'

const settingsOpen = ref(false)
const fileListRef = ref(null)
const configured = computed(() => isConfigured())

function openSettings() {
  settingsOpen.value = true
}

function onSettingsSaved() {
  toast('仓库设置已保存', 'success')
  fileListRef.value?.reload()
}

function onUploaded() {
  fileListRef.value?.reload()
}

onMounted(() => {
  if (!configured.value) settingsOpen.value = true
})
</script>

<template>
  <main class="stack">
    <section class="page-intro">
      <h2>管理台</h2>
      <button type="button" class="btn ghost" @click="openSettings">仓库设置</button>
    </section>

    <div v-if="!configured" class="notice">
      <span class="notice-icon" aria-hidden="true">!</span>
      <p>完成仓库设置后才能上传文件，设置只保存在当前电脑的浏览器里。</p>
      <button type="button" class="btn primary small" @click="openSettings">去配置</button>
    </div>

    <UploadZone @uploaded="onUploaded" @need-config="openSettings" />
    <FileList ref="fileListRef" mode="manage" @need-config="openSettings" />
  </main>

  <SettingsDialog v-model:open="settingsOpen" @saved="onSettingsSaved" />
</template>
