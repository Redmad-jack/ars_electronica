# ars_electronica · Co-Breathing Visual

ARS Electronica 2026 程序生成数字鱼与流体投影模拟。当前仓库是独立的模拟交接版本，不包含双站 Python 后端、固件或模型权重。

先阅读 [Mac mini 交接文档](docs/MAC_MINI_HANDOFF.md)，开发前遵循 [AGENTS.md](AGENTS.md)。最新设计与验证见 [展示执行计划](docs/EXHIBITION_VISUAL_PLAN.md)。

## 快速启动

安装 Node.js 和 Google Chrome。`co_breathing_visual/.nvmrc` 记录本次复现基线 Node 22.16.0。

```bash
cd co_breathing_visual
# 如使用 nvm：nvm install && nvm use
npm ci
npm run dev
```

Chrome 打开 <http://127.0.0.1:4173/?view=exhibition>；双鱼工作台为 <http://127.0.0.1:4173/?view=exhibition&scene=specimen&compare=1>。

`D` 调参、`F` 全屏、空格暂停、`R` 重置。展示入口不连接摄像头或硬件，数字鱼始终标记为程序生成。保留原 GPU 流体、不显示粒子、不原地绕圈。

## 检查与打包

```bash
npm test
npm run build
npm run test:e2e
npm run package:handoff
```

最近开发机结果：62 项单元测试、18 项浏览器测试通过；24 条鱼的 2 分钟短测约 60 FPS。Mac mini、新版 30 分钟运行和真实投影仍需验证。

源码、锁文件、测试和文档纳入 Git；`node_modules`、`dist`、录屏及打包产物不纳入 Git。完整迁移 ZIP 可以额外携带当前构建和本机审阅媒体，保存于 `outputs/handoff/`。浏览器保存的视觉参数不随仓库迁移，具体方法见交接文档。
