<script setup>
import { dismissToast, toasts } from '../lib/toast'
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="toast" tag="div" class="toast-stack">
      <div
        v-for="item in toasts"
        :key="item.id"
        class="toast"
        :class="item.type"
        role="status"
        @click="dismissToast(item.id)"
      >
        {{ item.message }}
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  left: 50%;
  bottom: 26px;
  transform: translateX(-50%);
  z-index: 999;
  width: min(520px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}

.toast {
  padding: 12px 16px;
  border: 1px solid rgba(253, 248, 238, 0.12);
  border-radius: 4px;
  background: #332d26;
  color: #fdf8ee;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.55;
  text-align: center;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 18px 44px -22px rgba(47, 40, 30, 0.65);
}

.toast.success {
  background: #3b5f50;
}

.toast.error {
  background: #8c3325;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
</style>
