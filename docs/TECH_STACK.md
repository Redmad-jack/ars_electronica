# Co-Breathing v4.0 技术栈

## 1. 运行节点

| 节点 | 硬件 | 软件职责 |
|---|---|---|
| 中国主机 | Mac mini | Python、OpenCV、鱼群聚合、映射、MQTT、USB Serial、日志 |
| 中国下位机 | ESP32-S3-DevKitC-1 | C++/Arduino 或 ESP-IDF；串口、TTL、PCA9685、16 路震动、安全归零 |
| 奥地利边缘节点 | Raspberry Pi 5 + 64 GB | Python、OpenCV、人体跟踪、MQTT、泵场、程序退流、安全状态 |
| 奥地利加速器 | AI HAT+ 26 TOPS | Hailo-8 person detector 推理；未到货时 CPU-only |

## 2. Python 边界

- Python 3.11+，配置继续使用 YAML。
- `shared`：不可变消息对象、模式、JSON、序列、TTL 和数值验证。
- `china`：真实鱼群聚合、观众到震动、鱼群到水流。
- `austria`：匿名人物状态、容量选择、泵场、断网退流和本地安全。
- `tools`：双站 dry-run、消息验证和人体性能测试。
- P0 不引入数据库、Web 框架、任务队列或真实硬件依赖。

## 3. 视觉后端

- 奥地利正式：AI HAT+ 26 TOPS + Hailo/ByteTrack，轻量 person detector。
- 奥地利降级：YOLOv8n NCNN，416 输入，必要时 320；检测 3–5 Hz，状态 5–10 Hz。
- 中国优先：固定相机背景差分/轮廓 + 短时轨迹；必要时 Mac 轻量 YOLO。
- Track Anything、SAM、XMem、姿态和分割不进入 P0。

## 4. 通信

- 跨国：MQTT over TLS/WSS 443，只传 `AudienceState`、`FlowIntent` 和站点/安全消息。
- 中国本地：Mac mini 到 ESP32-S3 使用 USB Serial。
- 奥地利本地：Pi 使用 I²C/GPIO；P0 由 no-op 适配器占位。
- MQTT、串口和硬件驱动均通过端口接口与纯业务逻辑隔离。

## 5. 当前依赖策略

Phase 1 的 CPU Vision 使用 Ultralytics 8.4.47、NCNN、ByteTrack `lap`；PNNX 只用于 Mac 端模型导出。Hailo 路径使用 Raspberry Pi OS 的 `hailo-all`/`python3-hailort` 系统包和 Hailo-8 YOLOv8s HEF，虚拟环境必须以 `--system-site-packages` 创建；不从 pip 安装 HailoRT。MQTT、serial 和 GPIO 库继续在对应硬件阶段进入设备依赖文件。
