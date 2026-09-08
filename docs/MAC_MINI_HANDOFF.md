# 模拟项目迁移到 Mac mini

交接日期：2026-09-08。范围：`co_breathing_visual` 程序生成模拟／投影展示，不是整个双站硬件项目的备份。

## 先选最快的路径

交接目标为用户已授权新建的私有仓库 [Redmad-jack/ars_electronica](https://github.com/Redmad-jack/ars_electronica)，使用 **GitHub + 本交接文档** 继续开发，ZIP 则通过 AirDrop、移动硬盘或局域网作为迁移附件。源码、测试、锁文件和文档进入 Git，录屏、安装依赖、构建产物留在本机或作为单独交付附件。

原工作区打包前状态：分支 `codex/v4-architecture`，HEAD `0f84b9f0d1da5e3600dd6fa11cad45ee0009ba94`，没有 Git 远端，且有大量未提交／未跟踪的改动。ZIP 读取实际工作区，包含这些最新模拟代码；上述 HEAD 本身**不能**还原当前效果。用户随后授权创建 GitHub 仓库；从交接副本建立独立仓库并发布模拟快照，原工作区不提交、不清理、不混入尚未整理的后端／硬件源码。新仓库初始分支为 `codex/mac-mini-handoff`。

ZIP 不含 `.git`、`node_modules`、测试缓存、密钥、Python 后端、固件或模型权重；包含模拟源码／测试、`package-lock.json`、构建后的 `dist`、相关项目规范、开发规则和可用的代表性截图／录屏。包内保留上级 `docs/` 与 `.codex/skills/`，请打开整个解压根目录工作，不要只移动 `src/`。

## Mac mini 首次启动

1. 安装适合目标机器芯片的 Node.js 和 Google Chrome。`.nvmrc` 记录本次复现基线 **Node 22.16.0**，不是对“最新安全版本”的声明；已有 nvm 可在下方项目目录执行 `nvm install`、`nvm use`。Vite 本地依赖声明要求 Node `^20.19.0 || >=22.12.0`。不要复制旧机器的 `node_modules`，其中有平台相关的可选二进制依赖。
2. 解压 ZIP，终端进入解压后的 `Co-Breathing-Visual`，执行：

```bash
cd co_breathing_visual
node --version
npm ci
npm run dev
```

3. 保持终端运行，在 Chrome 打开：

- 展览：[http://127.0.0.1:4173/?view=exhibition](http://127.0.0.1:4173/?view=exhibition)
- 双鱼工作台：[http://127.0.0.1:4173/?view=exhibition&scene=specimen&compare=1](http://127.0.0.1:4173/?view=exhibition&scene=specimen&compare=1)
- 上限负载：[http://127.0.0.1:4173/?view=exhibition&fish=24&scenario=crossing](http://127.0.0.1:4173/?view=exhibition&fish=24&scenario=crossing)

首次安装依赖需要网络；模拟展示本身不需要摄像头、Python、MQTT 或硬件服务。不要双击 `dist/index.html`，ES Modules 需要 HTTP 服务。只看构建版时，在安装依赖后用 `npm run preview`；预览与开发默认都占用 4173，不要同时启动。源码改动后必须重新 `npm run build` 才会更新预览版。

默认仅监听本机。若 4173 被其他程序占用，先查终端实际地址；换端口也会改变浏览器本地保存参数的作用域。先开启 Chrome 图形加速；若 WebGL 不可用，在 `chrome://gpu` 检查，不能用软件渲染的表现代表目标 GPU 性能。

## 本地视频与模拟同步分屏（2026-09-08 新增）

展示页按 `D` → “同步播放视频 + 模拟”，左侧播放本地录像，右侧运行正方形模拟。空格同时暂停／继续，`R` 同时从头重置，`F` 对整个分屏全屏；视频结束后两边停止。视频缓冲时模拟暂停，切到后台时两边暂停，返回前台后用空格继续。面板可退出分屏，恢复原展示画面，不改动鱼体或流体渲染。

本次开发机使用用户提供的 `/Volumes/新加卷/9月8日.mov`（HEVC、1920×1080、约 15 分 48 秒、1.1 GB），已实测 Chrome 可解码。**视频和本机 `.env.local` 不在 Git／ZIP 内，必须单独迁移。** 分屏源码、测试和使用说明随本次 GitHub 更新交付；已有克隆在 `codex/mac-mini-handoff` 分支执行 `git pull --ff-only` 获取。之前生成的 ZIP 是旧快照，不会随 GitHub 更新。

新机器最快的方式是点击“选择视频”，选中已复制的录像，再点击同步播放；不上传文件，刷新后需重新选择。若需每次直接打开同一视频，将 `co_breathing_visual/.env.example` 复制为 `.env.local`，把 `LOCAL_REFERENCE_VIDEO` 设置为新机器视频的绝对路径，重启开发／预览服务。不要使用 `VITE_` 前缀暴露本机路径。视频不支持时转为 H.264 MP4，或换 Chrome 验证。

实现位置：`src/exhibition/comparison.ts` 负责播放联动，`main.ts` 以视频时钟推进固定步长模拟，`scripts/reference-video.mjs` 为 Vite 提供单文件 Range 流式读取。浏览器自动测试生成小型 WebM，不依赖这份外部录像。分屏性能和真实投影还需在 Mac mini 上单独验收。

本次分屏回归：79 项单测、22 项 Chrome 浏览器测试通过（1080p／720p，4 项常规跳过的长测／录屏），构建通过。覆盖联动启动／暂停／恢复／重置、片尾停止、缺失文件后本地选择恢复、缩放／全屏与原展示回归；Range 返回 206、越界返回 416、跨站请求返回 403。实际 MOV 播放约 12 秒时，模拟落后约 13 ms、瞬时平滑帧率约 60 FPS、无页面异常；这是功能短测，不是整段录像或投影性能验收。效果截图为 `outputs/exhibition/video-comparison.png`。

## 画面、参数与边界

- 保持 1:1 正方形水域，宽屏居中留黑；默认 4 条鱼，可调 3–24 条。
- `D` 面板、`F` 全屏、空格暂停／继续、`R` 重置。输入框编辑时快捷键不生效；R 不自动取消暂停。
- 两种鱼：青蓝带状鱼、蓝紫扇鳍鱼。身体后向传播的波动、9 点柔性鳍条、GPU 参数曲面／细纹是最新版本。
- **继续保留原 GPU 流体效果、不加可见粒子、鱼不做原地绕圈运动。** 摄像头问题暂搁置。
- 展示入口不连接硬件／摄像头；原 `/` 是调试入口，会尝试连接本机 8765／8766 服务。未迁移后端时连接失败属预期，展示页不受影响。
- 数字鱼始终标记为程序生成，不能伪装成中国真实鱼数据；本次不改变双站协议或硬件安全边界。

视觉参数保存在旧浏览器的 `localStorage`，**不随 ZIP、Git 或 npm 迁移**。若旧机器已手动调参，先在旧机器 D 面板记录这五项，在新机器填入并点“保存展示参数”。本次没有读取或导出用户浏览器私有存储，以下是源码默认值，不代表旧浏览器中的自定义值：

| 曝光 | 线条亮度 | 柔光 | 鳍膜透明度 | 水中色彩 |
| --- | --- | --- | --- | --- |
| 1.25 | 1.00 | 0.45 | 0.10 | 1.00 |

鱼数、画质、物种、场景、种子和互动片段优先用 URL 复现。默认种子 `20260714`，标准画质 512×512 流体、DPR 上限 1.5，低负载档 256×256、DPR 上限 1；不会自动减少鱼数。

## 验收与已知未完成项

在 Mac mini 安装 Chrome 后运行：

```bash
npm test
npm run build
npm run test:e2e
```

浏览器测试配置指定系统 Google Chrome（`channel: chrome`），不是仅安装 Playwright 默认 Chromium。分屏功能加入后，当前开发机最近结果：79 项单测、22 项浏览器测试通过；常规测试会跳过 4 个长测／录屏案例。Vite 的共享 Three.js 分块约 538 kB，有 500 kB 体积提示，不是构建失败。

迁移包已在独立解压目录、Node 22.16.0 下重新执行 `npm ci`、62 项单测与构建，通过后再发布。2026-09-08 的 `npm audit` 报告两项间接开发依赖告警：`nanoid` 高危（GHSA-2v37-7h3g-55p8）、`postcss` 中危（GHSA-fxqj-rqcc-2cmp）。本次保留锁文件，不执行自动修复；后续单独升级并跑回归。在解决前保持开发服务仅监听本机，不引入不可信的 CSS 构建输入，也不要把这些告警当成已修复。

GPU 版本在 Apple M3 Pro 上做过 24 条鱼／标准画质／1080p／三人交错的 2 分钟 Chrome 无头短测，平均约 60 FPS、p95 16.8 ms；**不是 Mac mini 的性能结果**。不同芯片、显示器分辨率、DPR、图形加速和投影环境都需重新验证。

```bash
npm run test:media
npm run build
npm run test:benchmark
```

录屏与截图输出到上级 `outputs/exhibition/`；长测实际持续 30 分钟，使用 4174 的构建预览。当前 `benchmark-30min.json` 和 `school-24-after-30min.png` 是更早版本的历史材料，不代表恢复旧流体、移除粒子和新增 GPU 鱼体后的版本。新版 30 分钟稳定性、真实投影的黑位／细线／重叠色彩仍未验收。

## 接手时看哪些代码

| 文件（相对于 `co_breathing_visual/`） | 作用 |
| --- | --- |
| `src/main.ts`、`src/debug-main.ts` | 展示／原调试入口隔离 |
| `src/exhibition/config.ts`、`scenarios.ts` | 两种鱼预设、视觉参数、固定互动和动作片段 |
| `src/exhibition/body.ts`、`fish.ts` | 定长主链、尾波、9 点角度弹簧鳍条、边界 |
| `src/exhibition/fish-view.ts`、`fish-shaders.ts` | 静态参数网格、32×28 控制纹理、GPU 曲面／细纹 |
| `src/exhibition/world.ts` | 群游、观众响应、CPU 行为流场、旧流体注入 |
| `src/exhibition/renderer.ts`、`src/render/visual-fluid.ts` | 原 GPU 流体、独立流场测试路径、柔光 |
| `tests/exhibition.test.ts`、`e2e/exhibition-*.spec.ts` | 鱼体稳定性、GPU 回读、交互、资源、录屏与性能 |

先读根目录 `AGENTS.md`、`docs/PRD.md`、`docs/FRONTEND_GUIDELINES.md` 和 `docs/EXHIBITION_VISUAL_PLAN.md`。`docs/TECH_STACK.md` 主要描述双站 Python 系统；浏览器模拟的具体技术栈以展示计划和前端 `package.json` 为准。相关硬件规范随包供上下文阅读，但 Python／固件源码不在本次模拟交接包中。

可直接给下一位开发助手的接手说明：

> 这是 Co-Breathing 程序生成数字鱼投影展示项目。先阅读 AGENTS.md、docs/MAC_MINI_HANDOFF.md 和 docs/EXHIBITION_VISUAL_PLAN.md，按项目 karpathy-guidelines 工作。当前重点是两种鱼的自然身体／鳍条运动和 GPU 美化；必须保留原 GPU 流体、无可见粒子、不原地旋转，摄像头先不处理。先用 npm ci 安装并跑通展览和双鱼工作台，再运行测试，确认 Mac mini 的实际性能。未接真实投影，不能沿用旧机器的长测结论。不要自行改后端协议、启动真实硬件、提交或推送 Git；继续优化前先和用户确认下一项。

## GitHub 交接建议

新私有仓库保留 `co_breathing_visual/`、`docs/` 与开发规则的相对目录结构，首次发布只包含本次模拟项目，不是原硬件仓库的完整镜像。后续 Git clone／pull 同步源码，交接 ZIP 用于迁移和离线备份。实际发布的提交以 GitHub 分支记录为准；ZIP 的 `sourceHead` 是打包目录当时的 HEAD（可能来自原仓库，也可能来自新的交接仓库），不保证包内没有额外的未提交改动。

推送前在旧机器审核 `git status --short`，明确本次要提交的范围；不要无差别 `git add .`。最新展示代码和文档有未跟踪文件，必须一并纳入；只推已有 HEAD 会漏掉本轮工作。跨目录的既有硬件改动也应单独审核，不能擅自清理。保留 `package-lock.json`，不要提交依赖、构建、录屏、凭据和模型权重。

Mac mini 如已安装 GitHub CLI，可按下列方式用 HTTPS 登录并克隆私有仓库（已有有效登录可跳过登录；已配置可用 Git HTTPS 凭据也可直接 `git clone https://github.com/Redmad-jack/ars_electronica.git`）：

```bash
gh auth login --hostname github.com --git-protocol https
gh repo clone Redmad-jack/ars_electronica
cd ars_electronica/co_breathing_visual
# 已安装 nvm 时：nvm install && nvm use
npm ci
npm run dev
```

本次旧机器的 SSH 连接测试返回 `Permission denied (publickey)`，但 GitHub CLI 登录有效，因此发布使用该登录的 HTTPS 凭据，不修改 SSH 密钥或配置。若新机器使用 SSH，应先自行确认 `ssh -T git@github.com` 能识别正确账号。

每次交接记录“已提交的 commit、未完成项、启动命令、验证结果”，不要以聊天记录作为唯一交接依据。ZIP 不带 Git 历史；若先在 ZIP 中开发，之后先备份新改动，再在 clone 中按文件对照合并，不要直接覆盖。恢复开发优先在新仓库 clone 中进行，避免交接副本与原工作区同时修改同一模拟版本而产生分叉。

## 重新打包与完整性检查

在前端目录执行 `npm run package:handoff`。它先构建，再把实际工作区中的模拟文件打包到上级 `outputs/handoff/`；需要本机 `zip`／`unzip`，不需要新 npm 依赖。每次生成带 UTC 时间戳的新文件，不覆盖旧包。可选媒体缺失会明确提示，源代码包仍可生成。

把 ZIP 和同名 `.sha256` 一起传到 Mac mini，在下载目录运行 `shasum -a 256 -c 文件名.zip.sha256`。解压根目录另有 `CHECKSUMS.sha256`，执行 `shasum -a 256 -c CHECKSUMS.sha256` 可以逐文件核验。`MANIFEST.json` 记录文件摘要、打包 Node 版本、时间和来源 HEAD；HEAD 只作溯源，不表示本包已提交到 Git。
