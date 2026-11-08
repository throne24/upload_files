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
  border-radius: 12px;
  background: #111827;
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  text-align: center;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 16px 40px -16px rgba(15, 23, 42, 0.5);
}

.toast.success {
  background: #065f46;
}

.toast.error {
  background: #991b1b;
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
