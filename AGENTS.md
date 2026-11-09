# 项目约束与测试方案

你是一名高级前端开发工程师，熟练使用vue及其生态构建与部署大型网站
本文件是本项目的执行约束，AI 在修改代码、安装依赖、执行验证前必须先阅读并遵守。
本文件由用户维护；如需调整，必须先说明原因并取得用户确认。
当本文件与用户的最新指令冲突时，以用户最新指令为准，但要主动指出冲突点。

---

## 1. 项目定位

1. 这是一个纯静态的 Vue 3 + Vite 网站，不使用后端、数据库或服务端函数。
2. 文件存储在 GitHub 仓库中，读、写、删全部通过 GitHub Contents REST API 完成。
3. 网站部署在 GitHub Pages，仓库必须是 **Public**，否则免费账户无法开启 Pages，且第二台电脑无法免登录下载。
4. 网站定位是「文件中转站」：第一台电脑上传，任意电脑打开网址下载和预览。
5. 当前功能范围：上传、列表、预览、下载、删除、仓库设置。不主动扩展范围。

---

## 2. 安全与数据约束

1. **令牌安全**：Personal Access Token 只允许保存在用户浏览器的 `localStorage`。
2. 禁止把令牌写入源码、注释、构建产物、日志、提交记录或任何测试 fixture。
3. 禁止在错误提示、`console` 输出中回显令牌内容。
4. 令牌权限应限制为「指定仓库 + Contents: Read and write」，不得要求更大权限。
5. 文件按二进制原样保存和下载，禁止做格式转换或重新编码。
6. 预览是只读操作：不产生提交、不修改仓库、不需要令牌。
7. 允许上传的扩展名：`txt`、`md`、`doc`、`docx`、`pdf`、`xls`、`xlsx`、`ppt`、`pptx`、`csv`。
8. 可在线预览的扩展名：`txt`、`md`、`csv`、`docx`、`pdf`、`xls`、`xlsx`；`doc`、`ppt`、`pptx` 只下载。
9. 预览渲染的 DOCX / XLSX HTML 必须先经 DOMPurify 清洗，才允许 `v-html`。
10. Mammoth、SheetJS 等解析库必须按需动态导入，不得打进首屏包。

---

## 3. 工程约束

1. 部署路径依赖 `vite.config.js` 中的 `base: './'`，不得改成绝对路径。
2. `node_modules`、`dist`、`.env`、令牌文件不得提交到仓库。
3. 项目使用 pnpm，新增依赖前必须说明用途并获得确认。
4. 已有依赖：`vue`、`mammoth`、`xlsx`、`dompurify`；禁止引入功能重复的库。
5. 组件使用 Vue 3 `<script setup>`；组件文件 PascalCase，`src/lib` 下工具文件 camelCase。
6. 界面文案使用中文，错误提示必须说明「发生了什么 + 怎么解决」。
7. 不使用 `console.log` 留下调试输出；必要的 `catch` 要写明忽略原因。
8. 移动端最小验证宽度 390px，弹窗和操作按钮不得横向溢出。
9. 不做超出需求的「顺手优化」和无关重构；发现已有缺陷单独报告，不混入当前改动。
10. 文件类型的唯一事实来源是 `src/lib/filetypes.js`（本次重构完成后生效），`UploadZone` 的 `accept` 属性和上传校验必须引用同一份定义。

---

## 4. 变更流程

1. 任何代码修改前，先给出方案：改哪些文件、为什么、如何验证、有无副作用。
2. 方案经用户确认后才执行；一次变更只做一件事。
3. 修改完成后必须执行 `pnpm build`，确认构建通过。
4. 涉及上传、下载、预览、删除的改动，还必须执行 `pnpm preview`，用生产构建做冒烟验证。
5. 单元测试落地后，任何 `src/lib` 改动必须先跑 `pnpm test`，再跑构建。
6. 测试产生的临时页面、fixture、截图、脚本不得留在仓库中。
7. 未经用户明确要求，不创建 git 提交、不推送、不改远程配置。

---

## 5. 测试分层

1. **单元测试（本轮范围）**：只测 `src/lib/**` 的纯逻辑，不挂载组件、不启动浏览器、不访问网络。
2. **组件测试（阶段二，暂不实施）**：`UploadZone`、`FileList`、`PreviewDialog` 的交互与状态。
3. **端到端测试（阶段三，暂不实施）**：Playwright 拦截 GitHub API，覆盖完整用户路径；真实 API 只保留低频冒烟。
4. 当前状态：项目尚未安装任何测试依赖，`package.json` 中没有 `test` 脚本，覆盖率为 0。

---

## 6. 单元测试方案

### 6.1 工具与配置

1. 测试框架：`vitest`。
2. DOM 环境：`happy-dom`（提供 `localStorage`、`FileReader`、`URL` 等）。
3. 覆盖率：`@vitest/coverage-v8`。
4. 在 `vite.config.js` 中增加 `test` 配置：
   - `environment: 'happy-dom'`
   - `include: ['tests/unit/**/*.spec.js']`
   - `coverage.include: ['src/lib/**/*.js']`
   - `coverage.exclude: ['src/site-config.js']`
5. `package.json` 增加脚本：
   - `test`: `vitest run`
   - `test:watch`: `vitest`
   - `test:coverage`: `vitest run --coverage`
6. 测试文件放在 `tests/unit/`，命名与被测模块一致，如 `filetypes.spec.js`。

### 6.2 前置小重构（行为不变，需确认后执行）

1. `src/lib/filetypes.js`
   - 增加 `ACCEPTED_EXTENSIONS`、`ACCEPTED_PATTERN`、`isAcceptedDocument(name)`、`ACCEPT_ATTRIBUTE`。
   - `UploadZone.vue` 删除内部 `ALLOWED_PATTERN`，改用 `isAcceptedDocument` 和 `ACCEPT_ATTRIBUTE`。
   - 保留现有 `isPreviewable` / `extensionOf` / `extensionLabel` 行为。
2. `src/lib/text.js`
   - 把 `PreviewDialog.vue` 内的 `decodeText` 原样迁出并导出，组件引用该函数。
3. `src/lib/config.js`
   - 导出 `normalizeDir`。
   - 把 `detectRepoFromUrl()` 改为 `detectRepoFromUrl(hostname, pathname)`，内部调用处传入 `window.location`，行为不变，便于测试。
4. 上述重构不做任何 UI 或行为调整；如果用户不同意，则相应模块改用组件测试覆盖，并调整本方案。

### 6.3 用例清单

| 测试文件 | 被测对象 | 必测用例 |
| --- | --- | --- |
| `filetypes.spec.js` | `isPreviewable` / `isAcceptedDocument` / `extensionOf` / `extensionLabel` | 各扩展名返回真/假；大小写；多点文件名（`a.b.docx`）；无扩展名；尾部点；`label` 大写并截断 4 位；无扩展名返回 `FILE`；上传白名单与预览白名单的差异（`doc` 可上传不可预览） |
| `config.spec.js` | `normalizeDir` / `detectRepoFromUrl` / `saveConfig` / `isConfigured` / `canWrite` | `'/files/'`、`'a//b/'`、空串、纯空格 → 规范化结果；`user.github.io` + `/repo/` 识别；多级路径只取第一段；根路径、自定义域名、localhost 返回 `null`；`saveConfig` 归一化分支和目录并写入 localStorage；非法 JSON 不抛出；空字段不覆盖已有值；`isConfigured` / `canWrite` 真值表 |
| `github.spec.js` | `listFiles` / `getEntry` / `uploadFile` / `downloadFile` / `deleteEntry` / `sanitizeFilename` / `fileToBase64` / `saveBlob` / 错误映射 | URL 拼接与分支参数；中文、空格路径的编码；无令牌无 Authorization、有令牌为 `Bearer`；`listFiles` 过滤目录项；目录 404 → 空数组；分支错误时的提示；`getEntry` 404 → `null`；`uploadFile` 的 PUT 体包含 base64、`branch`、覆盖时包含 `sha`；`downloadFile` 直连成功、404 回退 `download_url`、网络异常回退、两次都失败；`deleteEntry` 的 DELETE 体包含 `sha`；`sanitizeFilename` 去路径、替换非法字符、去前导点、空名回退、超长保留扩展名；`fileToBase64` 去掉 data URL 前缀；`saveBlob` 创建并回收 Object URL；401/403（限流与权限）/404/409/422/未知状态映射 |
| `text.spec.js` | `decodeText` | 正常 UTF-8 中文；含替换字符时回退 GBK（使用固定 GBK fixture 字节）；空 Buffer 返回空串；无替换字符时不触发回退 |

### 6.4 Mock 约束

1. 所有 GitHub 请求使用 `vi.stubGlobal('fetch', vi.fn())` 或等效方式模拟，禁止真实网络请求。
2. 统一构造响应辅助函数，明确 `status`、`ok`、`json()`、`blob()`，避免每个用例重复样板。
3. `localStorage` 使用 `happy-dom` 提供的能力；模块级初始化的用例通过 `vi.resetModules()` 加动态 `import()` 隔离。
4. `URL.createObjectURL` / `URL.revokeObjectURL` 使用 `vi.fn()` 替换；`setTimeout` 使用假定时器验证 2 秒后回收。
5. `FileReader` 优先使用 `happy-dom` 实现；若行为不稳定，则替换为可控的 mock。
6. 用例不得依赖当前时间、时区、随机数或真实用户文件。

### 6.5 编写规则

1. 新增功能必须同时新增或更新对应单元测试。
2. 修复缺陷时，先写一个能复现失败的用例，再改代码使其通过。
3. 只通过公开导出测试行为，不为测试而暴露内部实现。
4. 每个用例只验证一个行为，断言要具体；禁止为凑覆盖率写无意义断言。
5. 测试数据使用内联小 fixture 或 `tests/unit/fixtures/`，不得引用用户真实文件。
6. 不测试 Vue 内部实现、CSS 细节和第三方库自身能力。

### 6.6 执行与通过标准

1. `pnpm test` 全部通过，且测试过程不产生任何网络请求。
2. `pnpm test:coverage` 生成报告，`src/lib/**` 行覆盖率不低于 80%。
3. 关键分支必须有对应用例：
   - `downloadFile` 的两种回退路径与双失败路径；
   - `listFiles` 的目录 404 与分支错误；
   - 错误状态映射；
   - `config` 的 URL 识别与目录规范化；
   - `decodeText` 的 GBK 回退。
4. `pnpm build` 必须通过，`dist` 产物结构不变。
5. 若测试暴露真实缺陷，只修缺陷本身，并在结果中单独说明；不顺带重构无关代码。

### 6.7 交付物

1. `package.json`：新增 devDependencies 与 3 个测试脚本。
2. `vite.config.js`：新增 `test` 配置块。
3. `tests/unit/filetypes.spec.js`、`config.spec.js`、`github.spec.js`、`text.spec.js`。
4. 6.2 中的四处小重构。
5. 更新本文件第 5 节的「当前状态」。

### 6.8 不在本轮范围

1. 组件测试、Playwright E2E、浏览器截图回归。
2. 真实 GitHub 仓库的写入测试（上传、删除、令牌校验）。
3. CI 门禁：是否在 Pages 部署工作流中加入 `pnpm test`，需另行确认；默认不修改部署流程。

---

## 7. 验收清单

- [ ] 已安装 `vitest`、`happy-dom`、`@vitest/coverage-v8`。
- [ ] `package.json` 含 `test`、`test:watch`、`test:coverage`。
- [ ] `vite.config.js` 含 `test` 配置。
- [ ] 6.2 的四处重构已完成且构建通过。
- [ ] 四个测试文件覆盖 6.3 的全部必测用例。
- [ ] `pnpm test` 离线全绿。
- [ ] `src/lib/**` 行覆盖率 ≥ 80%，关键分支全部覆盖。
- [ ] `pnpm build` 通过。
- [ ] 仓库中没有残留测试页面、fixture 截图或临时脚本。
