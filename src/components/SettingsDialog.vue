<script setup>
import { reactive, ref, watch } from 'vue'
import { config, saveConfig } from '../lib/config'
import { fetchBranch, fetchRepo } from '../lib/github'

const props = defineProps({
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['update:open', 'saved'])

const dialogRef = ref(null)
const draft = reactive({
  owner: '',
  repo: '',
  branch: '',
  dir: '',
  token: '',
})
const testing = ref(false)
const testResult = ref(null)
const formError = ref('')

watch(
  () => props.open,
  isOpen => {
    if (isOpen) {
      draft.owner = config.owner
      draft.repo = config.repo
      draft.branch = config.branch
      draft.dir = config.dir
      draft.token = config.token
      testResult.value = null
      formError.value = ''
      if (dialogRef.value && !dialogRef.value.open) dialogRef.value.showModal()
    } else if (dialogRef.value?.open) {
      dialogRef.value.close()
    }
  },
)

function closeDialog() {
  dialogRef.value?.close()
}

function onNativeClose() {
  emit('update:open', false)
}

function onBackdropClick(event) {
  if (event.target === dialogRef.value) closeDialog()
}

function normalizeSegments(raw) {
  const text = String(raw || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .split(/[?#]/)[0]
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
  return text.split('/').filter(Boolean)
}

function normalizeOwner(raw) {
  return normalizeSegments(raw)[0] || ''
}

function normalizeRepo(raw) {
  const segments = normalizeSegments(raw)
  return segments.length > 1 ? segments[1] : segments[0] || ''
}

const NAME_PATTERN = /^[A-Za-z0-9_.-]+$/

function validate() {
  const owner = normalizeOwner(draft.owner)
  const repo = normalizeRepo(draft.repo)
  if (!owner || !repo) {
    formError.value = '请填写仓库所有者和仓库名称'
    return null
  }
  if (!NAME_PATTERN.test(owner) || !NAME_PATTERN.test(repo)) {
    formError.value = '仓库所有者 / 名称只能包含字母、数字、-、_ 和 .'
    return null
  }
  return { owner, repo }
}

function save() {
  formError.value = ''
  const target = validate()
  if (!target) return
  saveConfig({
    owner: target.owner,
    repo: target.repo,
    branch: draft.branch.trim() || 'main',
    dir: draft.dir,
    token: draft.token.trim(),
  })
  emit('saved')
  closeDialog()
}

async function testConnection() {
  formError.value = ''
  testResult.value = null
  const target = validate()
  if (!target) return

  testing.value = true
  try {
    const client = { ...target, token: draft.token.trim() }
    const info = await fetchRepo(client)
    let branch = draft.branch.trim() || info.default_branch
    let note = ''

    if (branch !== info.default_branch) {
      try {
        await fetchBranch(client, branch)
      } catch {
        note = `分支「${branch}」不存在，已自动切换为默认分支「${info.default_branch}」。`
        branch = info.default_branch
      }
    }
    draft.branch = branch

    if (info.private) {
      testResult.value = {
        type: 'warn',
        text: `连接成功 · 默认分支 ${info.default_branch} · 私有仓库无法让另一台电脑免登录访问，建议改为公开仓库。${note}`,
      }
    } else {
      testResult.value = {
        type: 'ok',
        text: `连接成功 · 默认分支 ${info.default_branch} · 公开仓库${note ? ' · ' + note : ''}`,
      }
    }
  } catch (error) {
    testResult.value = { type: 'error', text: error?.message || '连接失败，请检查填写内容' }
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <dialog ref="dialogRef" class="settings-dialog" @close="onNativeClose" @click="onBackdropClick">
    <form class="dialog-body" @submit.prevent="save">
      <header class="dialog-head">
        <div>
          <h2>仓库设置</h2>
          <p>配置用来存放文档的 GitHub 仓库</p>
        </div>
        <button type="button" class="close-btn" aria-label="关闭" @click="closeDialog">×</button>
      </header>

      <div class="field">
        <label for="cfg-owner">仓库所有者</label>
        <input
          id="cfg-owner"
          v-model="draft.owner"
          placeholder="你的 GitHub 用户名，例如 octocat"
          autocomplete="off"
          spellcheck="false"
        />
      </div>

      <div class="field">
        <label for="cfg-repo">仓库名称</label>
        <input
          id="cfg-repo"
          v-model="draft.repo"
          placeholder="例如 file-share"
          autocomplete="off"
          spellcheck="false"
        />
      </div>

      <div class="field-row">
        <div class="field">
          <label for="cfg-branch">分支</label>
          <input id="cfg-branch" v-model="draft.branch" placeholder="main" autocomplete="off" spellcheck="false" />
        </div>
        <div class="field">
          <label for="cfg-dir">存储目录</label>
          <input id="cfg-dir" v-model="draft.dir" placeholder="files" autocomplete="off" spellcheck="false" />
        </div>
      </div>

      <div class="field">
        <label for="cfg-token">Personal Access Token</label>
        <input
          id="cfg-token"
          v-model="draft.token"
          type="password"
          placeholder="粘贴细粒度令牌，上传和删除需要"
          autocomplete="off"
          spellcheck="false"
        />
        <p class="field-hint">
          令牌只保存在当前浏览器的本地存储里，不会发送到其他服务器；只浏览和下载时可以不填。
        </p>
      </div>

      <p v-if="formError" class="form-error">{{ formError }}</p>
      <p v-if="testResult" class="test-result" :class="testResult.type">{{ testResult.text }}</p>

      <div class="dialog-actions">
        <button type="button" class="btn ghost" :disabled="testing" @click="testConnection">
          {{ testing ? '测试中…' : '测试连接' }}
        </button>
        <button type="submit" class="btn primary">保存设置</button>
      </div>

      <details class="help">
        <summary>如何获取令牌？</summary>
        <ol>
          <li>
            打开
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
              GitHub 令牌创建页
            </a>
            。
          </li>
          <li>Token name 随意填写，Expiration 建议选 90 天或更久。</li>
          <li>Repository access 选「Only select repositories」，勾选本仓库。</li>
          <li>Repository permissions 中把「Contents」改为「Read and write」，生成后复制令牌粘贴到上方。</li>
        </ol>
        <p class="help-note">
          仓库需要是 Public（公开）：GitHub Pages 对私有仓库需要付费账户，另一台电脑也无法免登录访问。
        </p>
      </details>
    </form>
  </dialog>
</template>

<style scoped>
.settings-dialog {
  width: min(560px, calc(100vw - 32px));
  max-height: min(88vh, 820px);
  margin: auto;
  padding: 0;
  border: none;
  border-radius: 20px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 32px 90px -24px rgba(15, 23, 42, 0.55);
  overflow: auto;
}

.settings-dialog::backdrop {
  background: rgba(15, 23, 42, 0.48);
  backdrop-filter: blur(3px);
}

.dialog-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dialog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.dialog-head h2 {
  font-size: 19px;
  letter-spacing: -0.01em;
}

.dialog-head p {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-2);
}

.close-btn {
  flex: none;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--surface-soft);
  color: var(--text-2);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}

.close-btn:hover {
  background: #eef1f6;
  color: var(--text);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.field label {
  font-size: 13px;
  font-weight: 600;
}

.field input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  font-size: 14px;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.field input::placeholder {
  color: #a6adbd;
}

.field input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.14);
}

.field-hint {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.form-error {
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--danger-soft);
  color: #b91c1c;
  font-size: 13px;
}

.test-result {
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.6;
}

.test-result.ok {
  background: var(--success-soft);
  color: #047857;
}

.test-result.warn {
  background: var(--warn-soft);
  color: #92400e;
}

.test-result.error {
  background: var(--danger-soft);
  color: #b91c1c;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.help {
  padding-top: 14px;
  border-top: 1px solid var(--line);
  font-size: 13px;
  color: var(--text-2);
}

.help summary {
  cursor: pointer;
  color: var(--accent);
  font-weight: 600;
}

.help ol {
  margin: 10px 0 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  line-height: 1.6;
}

.help a {
  color: var(--accent);
}

.help-note {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}

@media (max-width: 560px) {
  .dialog-body {
    padding: 20px;
  }

  .field-row {
    grid-template-columns: 1fr;
  }
}
</style>
