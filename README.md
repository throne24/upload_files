# 易传

无需后端与服务器的个人文档中转站：在一台电脑上传文档，换一台电脑打开网页即可预览、下载。

[在线体验](https://throne24.github.io/upload_files/) · Vue 3 · Vite · GitHub Contents API · GitHub Pages

## 为什么做这个

临时跨设备传文档，常见做法是登录网盘或发即时通讯，前者重、后者容易过期。这个项目把 GitHub 仓库当作文件存储，网站本身是纯静态页面：

- **上传、删除**：浏览器直接调用 GitHub Contents API，需要 Personal Access Token（只保存在当前浏览器的 `localStorage`）
- **浏览、预览、下载**：公开仓库无需登录、无需令牌
- **部署**：GitHub Actions 自动构建并发布到 GitHub Pages

## 功能

### 文件库（免登录）

- 按文档 / 表格 / 演示 / PDF / 文本 / 其他自动分类
- 关键词搜索，按最近更新 / 名称 / 大小排序
- 在线预览 TXT、MD、CSV、DOCX、PDF、XLS、XLSX；DOC、PPT、PPTX 仅下载
- 下载显示实时进度与速度
- 适配 390px 以上移动端

### 管理台（需令牌）

- 仓库设置：owner / repo / branch / 目录 / Token，支持一键测试连接
- 拖拽或选择文件，多文件顺序上传，队列中显示真实上传进度
- 同名文件二次确认后覆盖（基于 `sha`）
- 删除文件前二次确认

## 技术架构

```mermaid
flowchart LR
  A["浏览器（Vue 3 静态站点）"] -->|Contents API 读写| B["GitHub 仓库 files/"]
  A -->|镜像 / raw 直链下载| B
  B -->|push 触发| C["GitHub Actions"]
  C -->|构建 dist| D["GitHub Pages"]
  D -->|base: './'| A
```

网站自身不存储数据：文件列表就是目录 API 的返回结果，文件内容就是仓库里的文件。写操作携带令牌，读操作可匿名。

## 关键技术决策

| 问题 | 做法 | 取舍 |
| --- | --- | --- |
| `fetch` 拿不到上传进度 | 用 `XMLHttpRequest` + `upload.onprogress` 发送 PUT | 放弃 fetch 的简洁，换取真实字节进度 |
| 直连 GitHub 偶发缓慢或失败 | 下载按「公共加速镜像 → Contents API raw → `download_url`」三级回退，镜像 12 秒首字节超时（`AbortController`） | 提升弱网可用性，但依赖第三方镜像 |
| 同一文件反复下载 | `Cache Storage` 以 `owner/repo/sha/path` 为键缓存，写入时清理同路径旧版本；隐私模式或配额异常时静默回退网络 | 命中快且强一致，代价是占用本地存储 |
| 预览库体积大 | `mammoth`、`xlsx`、`dompurify` 在打开预览时才动态 `import` | 首屏包不含解析库，首次预览多一次加载 |
| DOCX / XLSX 转 HTML 后 `v-html` | 渲染前统一经 DOMPurify 清洗 | 防 XSS，代价是部分复杂样式被过滤 |
| 国内老文档编码混乱 | UTF-8 解码出现替换字符时回退 GBK | 解决乱码，非 UTF-8/GBK 编码仍可能异常 |
| 目录接口不返回上传时间 | 用 commits API 最近 100 条中 `上传文件：xxx` 的提交信息反推，失败返回空 Map | 不额外引入元数据文件，但网页外提交的文件没有时间 |
| Pages 子路径部署 | `vite.config.js` 使用 `base: './'`，运行时从 `用户名.github.io/仓库名/` 自动识别仓库 | 任意子路径可用，自定义域名需手动配置 |
| 上传文件会触发重新构建 | 部署工作流配置 `paths-ignore: files/**` | 只传文档时不浪费构建时间 |

## 目录结构

```
src/
├── components/          UploadZone / FileList / PreviewDialog / SettingsDialog / ToastStack
├── views/               FilesView（文件库）/ ManageView（管理台）
├── lib/
│   ├── github.js        GitHub Contents API 封装、上传下载、错误映射
│   ├── config.js        仓库配置与 localStorage 持久化
│   ├── filetypes.js     扩展名、分类与可预览判断
│   └── toast.js         全局提示
├── router.js
├── site-config.js       仅自定义域名部署时需要填写
└── style.css
.github/workflows/       Pages 自动部署
files/                   仓库内的文件目录（网站的数据）
```

## 本地运行

要求 Node.js `^20.19.0` 或 `>=22.12.0`，以及 pnpm。

```bash
pnpm install
pnpm dev       # 本地开发
pnpm build     # 生产构建
pnpm preview   # 预览生产构建
```

## 部署与配置

1. 新建一个 **Public** 仓库（GitHub Pages 免费账户要求仓库公开）
2. 创建 Fine-grained Personal Access Token：只授权该仓库，权限为 `Contents: Read and write`
3. 部署完成后打开网站，在「管理台 → 仓库设置」填入 Token
4. 站点部署在 `https://用户名.github.io/仓库名/` 时会自动识别 owner 与 repo；使用自定义域名时需修改 [src/site-config.js](src/site-config.js)

> 令牌只保存在当前浏览器的 `localStorage`，不会写入源码、构建产物或提交记录。设置只对当前浏览器生效，换设备需重新填写。

## 已知限制

- GitHub Contents API 对单文件大小有限制，且上传内容需 base64 编码（体积约增加 1/3），超大文件不适合此方案
- 文件存放在公开仓库中，任何拿到地址的人都能下载；私有仓库则必须提供令牌才能读取
- 下载优先使用公共加速镜像，属于第三方服务，可用性与隐私需自行评估
- Markdown 目前按纯文本预览，不渲染排版
- 单元测试尚未接入，计划用 Vitest 覆盖 `src/lib` 的纯逻辑

## 说明

个人学习项目，用于前端实习作品展示。
