# Co-Breathing 硬件与 CPU Vision 实测记录

更新日期：2026-09-08

本文件只记录已在当前开发环境实际读取或测试的事实。动态网络地址、设备序列号和 MAC 地址不写入版本库。

## 当前开发机

- MacBook Pro `Mac15,6`（MRX33CH/A）。
- Apple M3 Pro，11 核 CPU（5 Performance + 6 Efficiency）。
- 18 GB RAM，macOS 15.6.1，arm64。
- Python 3.12.10、OpenCV 4.13.0、PyTorch 2.11.0 CPU、Ultralytics 8.4.47。
- 这台机器用于开发验证，不代表中国最终 Mac mini 或奥地利 Raspberry Pi 5 的性能。

## 已连接设备

### ESP32-S3 CAM

- USB 芯片查询：ESP32-S3、revision v0.2、QFN56、40 MHz crystal、Wi-Fi/BLE、8 MB embedded PSRAM。
- USB 接口类型：USB Serial/JTAG；视频不通过 USB UVC 传输。
- 摄像头网页识别为 OV3660。
- 视频路径：局域网 HTTP MJPEG，流端口为 81；运行时地址必须通过 `HUMAN_URL` 或命令行提供。
- 实际解码：MJPEG Baseline、640×480、25 fps、`yuvj422p`。
- 摄像头 `/status` 的 `framesize=8` 与实际解码尺寸不一致，因此运行时以解码帧尺寸为准。
- 2026-09-08 在当前 Mac 上重新识别到摄像头板的 ESP32-S3 USB Serial/JTAG 接口。115200 串口日志显示摄像头固件启动后反复报告 Wi-Fi `Reason: 201 - NO_AP_FOUND`；本次采样未出现 brownout 或 camera framebuffer 错误。旧 MJPEG 地址在当前网络不可达，因此尚未产生新的真实人物识别帧，需先让固件加入当前可用 Wi-Fi。
- 2026-09-03 画面仍朝向天花板且清晰度不足，只能验证数据链，不能验收人体识别准确率。

### 其他 USB 设备

- Prolific USB-I2C Controller，VID `067b`、PID `2360`、bcdDevice `2.05`；只确认到 USB 描述符，具体板卡型号未知。
- Samsung PSSD T7 Shield。
- 以上设备不参与当前 CPU 人体后端的视频输入。

## CPU Vision 实测

- 标准 COCO `yolov8n.pt` 已成功导出为 416 和 320 两套 NCNN 模型。
- 导出环境：`ncnn 1.0.20260526`、`pnnx 20260526`；ByteTrack 依赖 `lap 0.5.13`。
- 416 模型使用本地示例人物图连续两帧检测到 3 人，Track ID 均保持为 `1, 2, 3`；这只验证接口和短时 ID 连续性，不是准确率基准。
- ESP32 实时流 416/5 Hz、12 秒 headless 复测：59 次状态更新，平均 4.90 Hz，端到端帧龄 p95 约 74 ms。
- ESP32 实时流 320/5 Hz、8 秒 headless 测试：39 次状态更新，平均 4.87 Hz，端到端帧龄 p95 约 204 ms；短测试受启动和网络波动影响，不能据此判定 320 慢于 416。
- 默认预览窗口已完成 3 秒自动关闭烟雾测试；真实人物框仍待摄像头重新布置后验证。
- 模型独立基准中，416 输入平均约 8.5 ms、320 输入平均约 5.7 ms；因此当前 Mac 端约 2 fps 的视觉停顿不能归因为模型算力不足。
- 独立 MJPEG 长测观察到实际到达帧率和标称 25 fps 不一致，并出现约 0.5–2 秒无新帧窗口；残留或多个流客户端也曾令 81 端口停止送帧。
- Phase 1 主机端已增加逐秒 JSONL 诊断：窗口采集/推理频率、帧龄、最大帧间隔、推理耗时、连接尝试、读失败和重连计数。ESP32 brownout、framebuffer 和 Wi-Fi 原因仍需可追溯固件通过 USB Serial 输出。

## Raspberry Pi 5 迁移实测（2026-09-04）

- 主机为 Raspberry Pi 5 Model B Rev 1.0、4 GB RAM、aarch64 Cortex-A76 四核。
- 系统为 Debian 13 (trixie)，kernel `6.18.34+rpt-rpi-2712`，Python 3.13.5。
- 实际 microSD 为 238.3 GB、根分区可用约 216 GB；与 PRD 中原定 64 GB 卡不一致，以本次硬件审计为事实记录。
- 初始温度 37.3°C，模型短测后最高观察到 44.4°C；所有检查均为 `throttled=0x0`。
- 独立目录 `/home/jackzhang/co-breathing-v4` 已安装 OpenCV 4.10.0、PyTorch 2.6.0 Debian、Ultralytics 8.4.47、NCNN 1.0.20260526 和 lap 0.5.13。
- Pi 上 Python 全部 119 项测试通过，用时 1.81 秒。
- 空白 640×480 帧的模型短测：416 输入平均 35.8 ms、p95 39.9 ms；320 输入平均 32.1 ms、p95 72.8 ms。该结果证明模型可在 Pi 加载并具备超过 10 Hz 的短时算力，但不代表真实多人画面或30分钟持续性能。
- 部署时发现 macOS `._model.ncnn.*` AppleDouble 文件会被 Ultralytics 误识别为模型文件并产生 `parse magic failed`；移除旁车文件后两套模型均可加载，真实模型 SHA-256 与 Mac 一致。

## AI HAT+ 与实时视觉复测（2026-09-05）

- AI HAT+ 26 TOPS 已被 PCIe 识别为 Hailo-8，`/dev/hailo0` 可用；HailoRT、PCIe driver、Python binding 版本均为 4.23.0，`hailo-all` 为 5.1.1。
- 官方 `/usr/share/hailo-models/yolov8s_h8.hef` 独立基准约 309 FPS，硬件延迟约 6.66 ms；该数字不包含摄像头、预处理和 ByteTrack。
- ESP32-S3 现已通过 USB Serial/JTAG 出现为 `/dev/ttyACM0`，局域网 MJPEG 可由 Pi 读取。当前实际解码尺寸变为 320×240，以帧内尺寸为准。
- Hailo 端到端 20 秒短测：目标 10 Hz，实际状态平均 7.96 Hz，摄像头平均 10.25 Hz，单次 Hailo 检测中位约 14.98 ms，帧龄 p95 约 86 ms，无重连或读取失败。实际输出受 MJPEG 约 0.88 秒最大帧间隔限制，不是 Hailo 算力限制。
- 短测后 Pi 温度 48.3°C，`throttled=0x0`。本地 Python 全部 123 项测试通过；Pi 上与视觉相关的 17 项测试通过。
- 当前 kernel `6.18.34+rpt-rpi-2712` 配合 Hailo PCIe driver 4.23.0 首次 VDMA buffer map 时产生 `find_vma`/`rwsem` 内核告警堆栈，但短测进程退出码为 0，识别结果正常。这是当前驱动/内核组合的未解决风险，在升级或回退到已验证组合并完成 30 分钟测试前，不应将 Hailo 路径作为无人值守展陈配置。

完整原始记录保存在 Git 忽略目录 `outputs/pi-migration-20260904/`。

## ESP32 执行器台架（历史 PCA9685 台架，2026-09-05）

- 下位机经原生 USB Serial/JTAG 实测为 ESP32-S3 rev 0.2、16 MB Flash、8 MB embedded PSRAM；当前设备为 `/dev/cu.usbmodem2101`，不是 CH343 UART 端口。
- 独立 PlatformIO 工程位于 `firmware/esp32_actuator_bridge/`，不依赖 Python 主程序、Web 模拟器或视觉模型。
- 固件已成功编译、写入并通过写后哈希校验；构建约使用 756 KB Flash、45 KB RAM。
- ESP32 GPIO8/GPIO9 上的 PCA9685 在 `0x40` 被启动初始化和手动扫描重复识别，运行状态持续报告 `pca_ok=true`。
- 已执行四路水泵各 25%/500 ms 和雾化 CH7 100%/500 ms 的串口命令；每次均由本地超时自动回到 `SAFE_OFF`，最终状态为 `armed=false`、四泵为零、雾化关闭。
- 雾化模块随后确认尚未接线，前述 CH7 记录只证明 PCA 命令执行，不构成雾化负载测试。
- 四路水泵又依次完成 CH0、CH1、CH2、CH3 各 100%/2000 ms 点动；每路动作期间状态均准确显示对应单通道为 1，其余为 0，约 2 秒后均报告 `command_timeout` 并回到 `SAFE_OFF`。控制链未出现 I²C 丢失、ESP复位或持续输出。
- 串口只能证明命令、PCA通信和关断状态机工作；水泵实际转动、水流与雾化出雾仍需现场观察确认。
- Wi-Fi/MQTT 尚未配置：当前状态 `wifi=false`，Mac 未运行 Mosquitto，真实 SSID/密码未写入被 Git 忽略的 `local_config.h`。

## ESP32 + ULN2803 模拟器台架（2026-09-08）

- 当前板卡通过 CH343 USB-UART 连接，实测 USB `VID:PID=1A86:55D3`；运行固件改用 UART0，避免原生 USB CDC 与外接 CH343 通道不一致。
- 已刷入独立 `firmware/esp32_uln2803_bridge/` 固件：GPIO4/5/6/7 分别对应左、右、上、下四路水泵；GPIO8 雾化预留持续强制为 LOW。
- CH1、CH2、CH3、CH4 已在水中依次以 100% 输出运行 2000 ms。四次均返回 `manual_pump_on`，随后按 TTL 返回 `command_timeout` 并全关。
- 现场人员确认四路水泵均实际正常运行并出水；最终固件状态为 `armed=false`、`current=[0,0,0,0]`、`targets=[0,0,0,0]`。
- 四路湿式人工验收通过，因此本地 Python Bridge 可在有人值守时启用 `hardware_interlock_verified`；启用联锁不等于自动 Arm，页面仍要求操作员显式解锁。
- 自动模拟输出仍限制为最多两泵同时工作、单路最高 35%、250 ms 斜坡和 500 ms TTL。10 分钟连续湿运行、USB 拔除以及温升验收尚未执行。
- 雾化硬件没有接入，本轮只有模拟预览，不构成雾化验收。
