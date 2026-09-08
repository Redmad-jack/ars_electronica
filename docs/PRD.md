# Co-Breathing 产品需求文档（PRD）v4.0

状态：已确认，可进入 P0 架构实现

日期：2026-09-03
适用阶段：ARS Electronica 2026 原型、联调与展陈

## 1. 项目目标

Co-Breathing 是连接中国工作室真实鱼群与奥地利展馆观众的双站互动装置。系统只跨国传输匿名、低维状态，不传视频：奥地利观众的运动在中国表现为 16 路震动场；中国 3–5 只真实鱼的群体运动在奥地利表现为水流与薄膜运动。

```text
奥地利观众摄像头
→ Raspberry Pi 5 + AI HAT+ 26 TOPS
→ AudienceState → MQTT → 中国 Mac mini
→ StimulusIntent → USB Serial → ESP32-S3
→ PCA9685 / ULN2803 → 16 路震动

中国真实鱼群（3–5 只）
→ 摄像头 → Mac mini
→ FishGroupState → FlowIntent → MQTT → 奥地利 Pi
→ PCA9685 / MOSFET → 3–9 路水泵 → 水流 / 薄膜
```

中国不存在模拟鱼群。奥地利断网时使用明确标记的受限程序水流 `procedural_fallback`，不得向观众或日志伪装为远端鱼群。

## 2. P0 范围与边界

### 2.1 必须实现

- 双站 Python 包边界、配置模板、消息契约和无硬件 dry-run。
- 奥地利最多发布 10 条匿名人物轨迹：框、Track ID、速度、活动量、置信度和最后观测时间。
- 中国聚合 3–5 只真实鱼为连续群体状态，并将鱼群状态映射为 `FlowIntent`。
- 中国把 `AudienceState` 映射为本地 `StimulusIntent` 和 16 路 `VibrationFieldCommand`。
- 奥地利把 `FlowIntent` 映射为 3–9 路 `PumpFieldCommand`。
- 外部消息版本、站点、序列、时间、TTL、有限数和范围校验。
- `LIVE_REMOTE`、`DEGRADED_LOCAL`、`SAFE_OFF` 状态与断网恢复交叉渐变。
- 所有 P0 配置默认为 mock/no-op，单条命令可完成双站 dry-run。

### 2.2 不在首个里程碑

- 真实公网 MQTT、GPIO、PCA9685、USB Serial 或固件写入。
- 人脸、身份、年龄、情绪、姿态、分割、动作分类和 `occupancy`。
- 跨国视频、远程逐通道直接控制、数据库或大型服务框架。
- 自动控制雾化；雾化仅接受奥地利本地操作员定时命令。
- 中国鱼群模拟、Track Anything、用程序水流伪装远端数据。

## 3. 站点职责

| 站点 | 设备 | P0 职责 | 明确不承担 |
|---|---|---|---|
| 中国 | Mac mini | 鱼群视觉、群体聚合、两方向高层映射、MQTT、日志与主状态机 | 直接驱动高电流负载 |
| 中国 | ESP32-S3 | 接收本地串口命令、TTL/序列校验、16 路震动执行与安全归零 | 公网 MQTT、视觉与高层映射 |
| 奥地利 | Raspberry Pi 5 | 人体检测/跟踪、MQTT、泵场映射、程序退流、本地安全与执行器适配 | 鱼群生成、人物身份识别 |
| 双站 | MQTT broker | 转发低维状态和站点状态 | 视频、硬件通道级控制 |

## 4. 功能需求

### 4.1 奥地利人体跟踪

每条轨迹仅包含：

```text
track_id, bbox_x, bbox_y, bbox_w, bbox_h,
velocity_x, velocity_y, activity, confidence, last_seen
```

- 坐标和框尺寸归一化到 0–1；速度单位为画面宽/高每秒；`last_seen` 使用 UTC Unix 秒。
- `activity` 仅由速度绝对值的短时 EMA 得出。
- 正式后端为 AI HAT+ 26 TOPS 上的轻量 person detector + Hailo/ByteTrack。
- 无 HAT 时使用 YOLOv8n NCNN，输入 416；不足时降至 320。
- CPU 模式允许检测 3–5 Hz，跟踪和状态输出 5–10 Hz。
- 检测可看到超过 10 人，但对外最多 10 条；优先保留稳定轨迹，再按互动区、框面积和置信度选择。
- 超限设置 `capacity_exceeded=true`，不提高分辨率或检测频率，也不让发布 ID 频繁抖动。

### 4.2 中国鱼群监测

- 只处理摄像头中的 3–5 只真实鱼。
- 固定机位优先采用背景差分/轮廓检测与短时轨迹；反光、遮挡或对比度导致不合格时才启用 Mac 轻量 YOLO。
- 单鱼输出与人物轨迹同类的框、匿名 ID、位置、速度、活动量和置信度。
- 聚合输出质心、平均速度、总体活动量、可见数量、聚散程度和置信度。
- 允许短时 ID 跳变；群体状态通过 EMA 和置信度门控保持连续。
- 无鱼或质量不足时不得生成虚构鱼状态，`FlowIntent.enabled=false`。

### 4.3 中国震动映射

- `AudienceState` 在 Mac mini 内部转换为 `StimulusIntent`。
- 空间位置、扩散和强度映射到 4×4、16 路归一化震动目标。
- Mac mini 通过 USB Serial 向 ESP32-S3 发送 `VibrationFieldCommand`。
- ESP32-S3 超时、断线、复位、序列错误或急停时必须归零；中国跨国数据中断 2 秒后震动关闭。

### 4.4 奥地利水流与雾化

- `FlowIntent` 转为 3–9 路泵目标，并经过低通、斜坡、最大占空比、最大同时泵数和变化率限制。
- 3 V 微型潜水泵直接在缸内以出水口作用薄膜，不要求独立导流结构。
- 雾化片由额定 5 V/1 A、通电即工作的成品驱动模块驱动；MOSFET 只切换模块电源。
- 雾化最多 6 路，P0 仅允许本地定时命令，不参与鱼群自动映射。

## 5. 数据接口

### 5.1 跨国消息

| 消息 | 方向 | 内容 |
|---|---|---|
| `AudienceState` | 奥地利 → 中国 | 最多 10 条匿名轨迹、数据质量、容量超限标记 |
| `FlowIntent` | 中国 → 奥地利 | 启用、强度、方向、区域、扩散、置信度和 TTL |
| `SiteHeartbeat` | 双向 | 站点、模式、健康时间 |
| `SiteStatus` | 双向 | 数据源、模式、质量和简要原因 |
| `SafetyEvent` | 双向 | 安全事件代码、严重级别、锁存状态和说明 |

### 5.2 站点本地消息

| 消息 | 范围 |
|---|---|
| `FishGroupState` | 中国 Mac 内部真实鱼群状态 |
| `StimulusIntent` | 中国 Mac 内部观众到刺激语义 |
| `VibrationFieldCommand` | 中国 Mac → ESP32-S3，固定 16 路 |
| `PumpFieldCommand` | 奥地利 Pi 内部，3–9 路 |
| `AtomizerCommand` | 奥地利本地操作员定时命令 |

所有外部消息包含 schema 版本、消息类型、唯一 ID、单调递增序列、源站点、源设备、UTC 时间、TTL 和 payload。进入映射前统一拒绝错误版本、错误类型/站点、重复或回退序列、未来时间、过期 TTL、NaN/Infinity 和越界值。

## 6. 网络与断网策略

- MQTT 使用 TLS/WSS 443 的出站连接；broker 区域在 Phase 0 以中国和奥地利双端 RTT、抖动、丢包和断线恢复实测锁定。
- QoS、保留消息和会话策略由消息类别确定；控制意图不得使用过期 retained 数据恢复。
- `LIVE_REMOTE` 连续 2 秒无新鲜 `FlowIntent` 后进入 `DEGRADED_LOCAL`。
- 本地退流使用固定会话种子的平滑随机游走，不逐泵随机硬开关。
- 新鲜远端数据连续稳定 10 秒后，再用 5 秒从退流交叉渐变至 `LIVE_REMOTE`。
- 退流状态显示并记录 `data_source=procedural_fallback`。
- 急停、硬件关断故障、Pi 主循环卡死或 PCA 输出异常直接进入 `SAFE_OFF`，不可进入退流。

## 7. 硬件基线

### 7.1 中国

- Mac mini ×1（具体型号、内存和端口待盘点）。
- 鱼群摄像头 ×1，固定机位。
- ESP32-S3-DevKitC-1 ×1，建议备件 ×1。
- PCA9685 ×1，ULN2803 ×2，16 路震动马达矩阵。
- 与负载匹配的独立电源、熔断/保险、端子和急停。
- 中国没有独立可控水泵；动物福利由现场人员持续照护，不纳入自动水温计算。

### 7.2 奥地利

- Raspberry Pi 5 ×1、64 GB microSD ×1。
- Raspberry Pi AI HAT+ 26 TOPS ×1；未到货时使用 CPU-only 后端。
- Active Cooler、可靠电源、通风外壳和安装支架。
- 观众摄像头 ×1。
- PCA9685 ×1；4 路 MOSFET 板按 3–9 路泵和最多 6 路雾化的通道数配置。
- 3 V/4.5 V、0.36 W、约 0.18 A、最大 100 L/h 微型潜水泵 3–9 个；实际启动电流和 PWM 响应待台架测量。
- 已有 MOSFET 板照片可识别 `817SC H609F` 光耦与 `CMD75N06 KG22203` MOSFET；逻辑门限、电流、PWM 频率和失效状态仍需实测。
- 5 V/1 A 雾化驱动模块和雾化片，最多 6 路。
- 3 V 稳压泵电源、5 V 雾化电源、实体急停、独立硬件看门狗/负载总使能。

Pi 通过 I²C 两脚控制 PCA9685，并使用带外部上拉的 `OE`。AI HAT+ 使用 PCIe，不消耗上述 I²C；但 HAT、散热器、排针和外壳的实际机械堆叠必须实装确认。参见 [Raspberry Pi AI HAT+ 官方文档](https://www.raspberrypi.com/documentation/accessories/ai-hat-plus.html)。

## 8. 安全与隐私

- 初始状态、未知状态和异常状态均为输出关闭。
- 未完成独立硬件关断、急停和失电验证前，只允许 mock/no-op 输出。
- 实体急停直接切断奥地利泵和雾化负载，不依赖 Linux、PCA 或网络。
- 独立硬件看门狗监测 Pi 心跳并控制 PCA `OE` 或负载总使能。
- 不保存人脸或可识别身份；默认只记录匿名状态与运行事件。
- 中国鱼类福利由现场人员负责；任何异常均可本地急停，远端不得绕过本地安全裁决。

## 9. P0 验收

- 原有 Python 71 项与 TypeScript 17 项测试继续通过。
- 消息测试覆盖 JSON 往返、TTL、序列、错误站点、非有限值和越界。
- 人体测试覆盖 1、5、10、超过 10 人、短时遮挡和互动区选择。
- 鱼群测试覆盖 3、4、5 只、短时漏检、ID 变化和无鱼。
- dry-run 覆盖正常闭环、2 秒退流、10 秒稳定恢复、5 秒渐变和 `SAFE_OFF`，且退出码为 0。
- CPU-only 在实际 Pi 连续运行至少 30 分钟：状态输出最低 5 Hz、目标 10 Hz、最多 10 轨迹，无持续热降频、内存增长或控制阻塞。
- AI HAT 到货后用同一视频集复测，目标 10 Hz 以上，并为 MQTT、界面和泵控制保留 CPU 余量。

## 10. Phase 0 待实测但不阻塞骨架

- MQTT broker 区域、证书部署与双端网络质量。
- Mac mini 型号、摄像头视场、安装高度和光照。
- AI HAT 到货、模型转换、散热和机械堆叠。
- 水泵启动/堵转电流、可接受 PWM 频率、最大占空比、最大同时泵数。
- MOSFET 板 3.3 V 触发可靠性、输入电流、光耦极性和掉电默认态。
- 独立看门狗型号、急停回路、PCA `OE` 上拉和负载总使能结构。
- 雾化安全时长、占空、补水要求和实际模块电流。
- 动物福利阈值由照护人员和实际鱼缸条件锁定。
