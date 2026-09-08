# Co-Breathing Visual

> 状态：奥地利本地退格模拟原型。输出必须标记为程序模拟，不得伪装成中国真实鱼群。

应用使用固定种子模拟人群和鱼群：人群是移动障碍物，鱼群保留 Boids 群游并避让人群。它默认只产生标准化模拟快照和执行器预览；在有人值守的本地台架中，可以通过独立 Python Bridge 和 USB Serial 把四路泵目标发送给 ESP32/ULN2803。雾化仍然只有预览，不连接真实输出。

## 运行

```bash
npm install
npm run dev
```

默认地址为 `http://127.0.0.1:4173`。

迁移到新机器先看 [Mac mini 交接文档](../docs/MAC_MINI_HANDOFF.md)。使用 `npm ci` 按锁文件安装；`.nvmrc` 记录迁移复现基线。执行 `npm run package:handoff` 可生成包含当前未提交模拟代码的迁移 ZIP，不包含依赖目录或 Git 历史。

## 程序生成投影展示版

- [展览画面](http://127.0.0.1:4173/?view=exhibition)：默认 4 条鱼，面板可调 3–24 条。
- [单鱼工作台](http://127.0.0.1:4173/?view=exhibition&scene=specimen)：物种、双鱼对照、骨架与六种游动片段。
- [水流测试](http://127.0.0.1:4173/?view=exhibition&scene=flow)：恒定向右／向上水流，观察被动漂移。

画面始终保留正方形水域与黑边。按 **D** 打开／关闭面板，**F** 全屏，**Space** 暂停／继续，**R** 重置。鼠标互动在面板中启用；拖动注入水流，悬停保留个人空间。输入框内不触发全局快捷键。

两种鱼分别是青蓝色带状鱼与蓝紫色扇鳍鱼。根据 2026-09-08 的视觉反馈，水流恢复原调试版的 GPU 流体求解、青色染料和琥珀色扰动，不再生成或绘制点状粒子。标准画质为 512×512 流体，低负载为 256×256；切换画质会重置模拟。CPU 流场用于鱼的行为，只有独立水流测试场景将其直接用于染料平流。

鱼以向前巡游和有前进位移的转弯为主；去掉周期性持续偏转及绕人的切向力，转弯角速度受主动游速和鱼体尺度限制。减速时同步减小转弯幅度，停留时不原地旋转。

鱼体视觉使用展示专用定长关节链和 GPU 参数曲面：身体波动向尾部放大，9 点弹簧鳍条在鳍尖产生延迟与回弹，胸鳍和尾鳍节奏不同。GLSL 从控制纹理生成平滑曲面、细丝、分叉鳍纹与透明褶皱；静止时仍保留轻微鳍动。该实现参考 Aquatics 的关节链构形思路，保留 CPU 行为确定性，不是对作者算法的逐项复刻。

展示面板提供无人、慢速经过、快速横扫、中心停留和三人交错五种固定输入。慢动温和，快动引起局部受惊，警觉逐渐衰减。展示模式不自动连接摄像头或硬件；原根入口的联调功能继续保留。

可复现 URL 参数：`fish=3..24`、`seed=20260714`、`scenario=none|slow|fast|hold|crossing`、`quality=standard|low`；单鱼场景支持 `species=ribbon|fan` 和 `compare=1`。例如 `/?view=exhibition&fish=24&scenario=crossing`。

“保存展示参数”将曝光、线条、柔光、鳍膜和染料强度保存到本浏览器，刷新后继续使用。场景、鱼数和输入不会被隐式保存，使用 URL 复现。现场先以默认参数检查黑位和细线，再调曝光；出现掉帧可手动选择低负载画质，不会自动减少鱼数。浏览器图形上下文恢复时重新加载场景。

实施依据与完整验收要求见 [展示执行计划](../docs/EXHIBITION_VISUAL_PLAN.md)。真实投影仪的黑位、尺寸与亮度仍需现场检查。

### 本地视频与模拟同步分屏

在展示页按 `D`，点击 **同步播放视频 + 模拟**：左侧本地视频、右侧正方形模拟，同时从头开始。视频保持原比例、不裁切；按 `D` 收起面板、`F` 整体全屏。空格联动暂停／继续，`R` 联动重置（暂停时保持暂停）；“退出分屏”返回单独模拟。视频结束时两边停止，不自动循环。切到后台时两边暂停，返回后按空格继续。

可直接点击“选择视频”打开本地 MOV／MP4／WebM，文件仅在浏览器本地使用，不上传、不进入 Git；刷新后需重新选择。也可复制 `.env.example` 为 `.env.local`，将 `LOCAL_REFERENCE_VIDEO` 改为本机视频的绝对路径，再重启 `npm run dev` 或 `npm run preview`。Vite 仅通过 `/__local/reference-video` 以 HTTP Range 流式提供这一份文件，不复制大文件、不开放任意文件路径；未点击播放前不会请求视频。`.env.local` 不进入 Git 或交接包。

模拟以视频播放进度为时钟，固定 60 Hz 步进；加载、缓冲时一起等待。这是本地播放联动，不是鱼运动与录像内容的自动匹配，也不提供逐帧硬件同步。视频保留原音轨；浏览器不支持编码时改用 H.264 MP4。普通静态服务器不具备本地视频路由，可使用“选择视频”路径。换机时请单独复制视频文件。

### 生成审阅材料与长测

```bash
npm run test:media
npm run build
npm run test:benchmark
```

输出在仓库 `outputs/exhibition/`（不纳入 Git）：单鱼与 4／12／24 鱼群 PNG、两个 36 秒 WebM，以及 `benchmark-30min.json`。长测使用 Chrome、1920×1080、24 条鱼、标准画质与三人交错，在 4174 端口运行冻结构建，持续 30 分钟；`benchmark-progress.json` 每分钟更新。常规 e2e 默认跳过这些耗时任务。

性能验收门槛：预热后平均 ≥55 FPS、p95 帧间隔 ≤25 ms，数值持续有限、图形资源稳定、无摄像头／硬件请求。结果中的浏览器和 GPU 信息用于区分桌面自动化测试与现场投影实测。

默认长测由 Playwright 使用本机 Chrome 的无头模式运行，帧间隔统计来自 `requestAnimationFrame`，不是投影仪实际呈现帧的测量。现场可用 `npm run test:benchmark -- --headed` 重跑有窗口版本；应保持测试页面在前台，不最小化或切换到其他标签页。

已有的 `benchmark-30min.json` 是本次恢复旧流体之前的历史结果，不能当作当前渲染路径的长测证明；当前修改的回归结果见展示计划中的更新记录。

## 本机人体识别桥

模拟器会以不高于 10 Hz 的频率读取 `http://127.0.0.1:8766/v1/audience`。识别服务健康时，摄像头产生的匿名 Track ID、框中心、速度与 activity 会替代程序化观众，并继续作为鱼群的障碍和流场来源；不传视频，也不做人脸或身份识别。识别桥不可用、画面过期或数据不合法时，自动恢复 0–3 人的程序化观众。

从 `co_breathing/` 目录启动当前电脑的 CPU-only 识别桥：

```bash
HUMAN_URL=http://CAMERA_IP:81/stream \
PYTHONPATH=src python3 -m co_breathing.tools.audience_tracker \
  --backend cpu_ncnn --headless --simulator-http
```

调试面板的 `Audience input` 区域显示输入来源、人数、帧龄和容量状态；`Reconnect camera` 会丢弃旧轨迹并主动重建 MJPEG 连接。

## 本地硬件桥（默认锁定）

先刷入 `firmware/esp32_uln2803_bridge/`，再从项目的 `co_breathing/` 目录启动 Bridge：

```bash
python3 -m pip install -r requirements-dev.txt
PYTHONPATH=src python3 -m co_breathing.tools.simulator_hardware_bridge
```

Bridge 只监听 `127.0.0.1:8765`，并按当前实测的 CH343 USB 串口标识 `VID:PID=1A86:55D3` 寻找 ESP32，不依赖会变化的 `usbmodem` 编号；连接多个同型号转接器或更换板卡时可显式传入 `--usb-vid`、`--usb-pid` 和 `--serial-number`。默认不通过电气联锁，浏览器中的 `Arm hardware` 会保持禁用。只有四路水泵全部通过文档规定的湿式验收后，才允许由现场操作员显式追加 `--hardware-interlock-verified`；页面刷新、暂停、隐藏、串口重连和500 ms命令超时都会撤销输出或解锁状态。

日志默认写入被 Git 忽略的 `outputs/hardware_sessions/simulator-bridge.jsonl`。Pump 命令固定为 CH1 左、CH2 右、CH3 上、CH4 下；Bridge 和 ESP32 都会再次限制为最多两路、单路最高35%。

## 交互

- 默认由程序化观众同时生成圆形障碍和局部流场。
- 鼠标交互默认关闭；只有在面板勾选 `Enable mouse interaction` 后才会生成障碍和流场。
- 模拟范围始终是居中的 1:1 正方形，鱼和完整鱼身不会游出边界。
- 默认鱼数为 4，可在 3–5 之间调整；鱼会在游动、减速、停留和快速逃离之间切换。
- 程序化观众在 0–3 人之间动态进出画面，作为移动障碍物。
- 正方形四边的 `L/R/T/B` 指示器预览四个水泵强度；箭头表示每个泵从边缘吹向缸内的方向。
- `MIST` 指示器预览鱼与人持续接近时的 0.8 秒雾化脉冲，并显示 10 秒冷却；它不是硬件反馈。
- 按住并拖动鼠标会向 CPU 行为流场与 GPU 视觉流体同时注入速度。
- 按 `D` 或点击左上角 `Controls (D)` 显示/隐藏调试面板。
- 调试面板可调整人数、人群速度、障碍半径、鱼数、群游权重、暂停和重置。

## 验证

```bash
npm test
npm run test:e2e
npm run build
```

`npm run test:e2e` 使用本机 Google Chrome，在 `1920x1080` 和 `1280x720` 下验证 WebGL 画布、交互像素变化与调试面板布局。
