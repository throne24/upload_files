<script setup>
import { onBeforeUnmount, onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import ToastStack from './components/ToastStack.vue'

// 防止把文件拖到页面空白处时，浏览器直接打开文件
function blockWindowDrop(event) {
  event.preventDefault()
}

onMounted(() => {
  window.addEventListener('dragover', blockWindowDrop)
  window.addEventListener('drop', blockWindowDrop)
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
        <span class="logo" aria-hidden="true">文</span>
        <h1>文件中转站</h1>
      </div>
      <nav class="main-nav" aria-label="主导航">
        <RouterLink class="nav-link" to="/files">文件库</RouterLink>
        <RouterLink class="nav-link" to="/manage">管理台</RouterLink>
      </nav>
    </header>

    <RouterView />

    <footer class="site-foot">© 纷乱世界不了解</footer>
  </div>

  <ToastStack />
</template>
