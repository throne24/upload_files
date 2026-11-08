<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import UploadZone from './components/UploadZone.vue'
import FileList from './components/FileList.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import ToastStack from './components/ToastStack.vue'
import { config, isConfigured } from './lib/config'
import { toast } from './lib/toast'

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

// 防止把文件拖到页面空白处时，浏览器直接打开文件
function blockWindowDrop(event) {
  event.preventDefault()
}

onMounted(() => {
  window.addEventListener('dragover', blockWindowDrop)
  window.addEventListener('drop', blockWindowDrop)
  if (!configured.value) {
    settingsOpen.value = true
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('dragover', blockWindowDrop)
  window.removeEventListener('drop', blockWindowDrop)
})
</script>

<template>
  <div class="page">
    <header class="site-head">
      <div class="brand">
        <span class="logo" aria-hidden="true">TXT</span>
        <div>
          <h1>TXT 中转站</h1>
          <p class="repo-line">
            <template v-if="configured">
              {{ config.owner }} / {{ config.repo }} · 分支 {{ config.branch }} · 目录 {{ config.dir }}/
            </template>
            <template v-else>还没有配置仓库</template>
          </p>
        </div>
      </div>
      <button type="button" class="btn ghost" @click="openSettings">仓库设置</button>
    </header>

    <div v-if="!configured" class="notice">
      <span class="notice-icon" aria-hidden="true">!</span>
      <p>完成仓库设置后才能上传文件，设置只保存在当前电脑的浏览器里。</p>
      <button type="button" class="btn primary small" @click="openSettings">去配置</button>
    </div>

    <main class="stack">
      <UploadZone @uploaded="onUploaded" @need-config="openSettings" />
      <FileList ref="fileListRef" @need-config="openSettings" />
    </main>

    <footer class="site-foot">
      文件直接提交到你的 GitHub 仓库，换台电脑打开同一网址即可下载；令牌只保存在本浏览器。
    </footer>
  </div>

  <SettingsDialog v-model:open="settingsOpen" @saved="onSettingsSaved" />
  <ToastStack />
</template>
