# Co-Breathing v4.0 接线计划

> 本文是架构接线基线，不是带电施工图。任何真实负载接入前必须完成电压、电流、极性、保险、急停和失效态验证。

## 1. 中国震动链

```text
Fish camera ─USB/局域网─> Mac mini
AudienceState ─MQTT─────> Mac mini
Mac mini ─USB Serial───> ESP32-S3
ESP32-S3 ─I²C──────────> PCA9685
PCA9685 CH0..15 ───────> ULN2803 ×2 ─> vibration motors ×16
独立负载电源 ───────────> motor rail
```

- Mac 与 ESP32 共享串口地；马达电源不由 USB、ESP32 或 PCA 逻辑电源提供。
- ESP32 复位、串口 TTL 到期和急停必须使全部 16 路归零。
- 串口帧格式和看门狗细节在硬件里程碑锁定；P0 仅生成 `VibrationFieldCommand`。

## 2. 奥地利泵链

```text
Audience camera ─USB/CSI─> Raspberry Pi 5
AI HAT+ 26 TOPS ─PCIe────> Raspberry Pi 5
Raspberry Pi 5 ─I²C──────> PCA9685
PCA9685 CH0..N ──────────> opto MOSFET boards ─> 3 V pumps
3 V regulated supply ────> pump load rail
```

建议逻辑连接（最终 BCM 引脚需现场锁定）：

- I²C SDA/SCL → PCA9685 SDA/SCL。
- Pi 3.3 V → PCA9685 VCC；负载电源不得接 VCC。
- PCA9685 `OE` → 安全总使能；外部上拉保证 Pi 未启动/复位时禁用输出。
- 独立硬件看门狗同时监测 Pi 心跳并控制 `OE` 或负载接触器。
- 物理急停串联在泵/雾化负载电源总线上，动作不依赖软件。

## 3. 奥地利雾化链

```text
Pi GPIO 或已验证 PCA 通道
→ MOSFET board
→ 5 V/1 A atomizer driver module power input
→ atomizer plate
```

- 不得把裸雾化片直接连接 GPIO、PCA9685 或 MOSFET。
- P0 只允许全开/全关的本地定时命令，不做自动 PWM 调功。
- 泵和雾化可共享急停逻辑，但使用各自额定电源和保险支路。

## 4. `OE`、急停和看门狗

```text
Pi heartbeat ─> independent watchdog ─┐
                                      ├─> PCA OE / load master enable
Physical E-stop ──────────────────────┘
```

- `OE` 高电平为 PCA 输出禁用态，需硬件上拉。
- 软件写零不是独立关断；Pi 卡死测试中负载仍必须自动关闭。
- 急停释放不自动恢复输出，须本地确认并重新进入运行状态。

## 5. 接线验收顺序

1. 断电核对标签、极性、地线、保险和端子拉力。
2. 不接负载，验证逻辑电压和 `OE` 默认禁用。
3. 单通道假负载测试 MOSFET 3.3 V 触发和掉电关闭。
4. 单泵测启动/堵转电流、PWM 和温升。
5. 逐步增加到最大同时泵数，验证电源压降。
6. 单路雾化验证模块电流、工作周期和防干烧要求。
7. 验证进程退出、Pi 冻结、I²C 故障、看门狗和实体急停。
8. 通过后才把配置从 `noop` 改为真实驱动。

## 6. Mac + ESP32 本地模拟台架

当前硬件输出阶段使用独立测试链，不引入摄像头、视觉模型或跨国数据：

```text
co_breathing_visual（Mac）
→ localhost HTTP（127.0.0.1:8765，最高 10 Hz）
→ Python 串口桥
→ USB Serial
→ ESP32-S3 CH343 N16R8
→ GPIO4..GPIO7
→ YwRobot ULN2803 Driver V2
→ four pumps
```

| 功能 | ESP32-S3 | ULN2803 模块 | 负载 |
|---|---|---|---|
| 左侧泵 / CH1 | GPIO4 | IN1 的 `S`；ESP GND 接 `G` | 泵正极接 `V+`，负极接 `OUT1` |
| 右侧泵 / CH2 | GPIO5 | IN2 的 `S`；与 ESP 共地 | 泵正极接 `V+`，负极接 `OUT2` |
| 上侧泵 / CH3 | GPIO6 | IN3 的 `S`；与 ESP 共地 | 泵正极接 `V+`，负极接 `OUT3` |
| 下侧泵 / CH4 | GPIO7 | IN4 的 `S`；与 ESP 共地 | 泵正极接 `V+`，负极接 `OUT4` |
| 负载供电 | 不由 ESP32 提供 | 5 V 接 `VIN`，电源负极接 `GND` | 四路共用模块 `V+` 母线 |
| 雾化预留 | GPIO8，固件强制 LOW | 本轮不接 | 禁止自动输出 |

- ESP32 GND、ULN2803 输入 `G` 和 5 V 负载电源 GND 必须共地；不需要把同一公共地重复接到每一路。
- 本轮删除 PCA9685 和光耦 MOSFET 板，旧 `esp32_actuator_bridge` 固件只作为历史原型保留。
- 运行固件位于 `firmware/esp32_uln2803_bridge/`；人工逐路验收固件位于 `firmware/esp32_uln2803_bench/`。
- 四路泵未全部通过水中 100%/2 秒实际出水验收前，Python Bridge 必须保持 `hardware_interlock_verified=false`，浏览器不能 Arm。
- 自动命令最多同时两路、单路最高 35%，500 ms 内没有新命令时 ESP32 立即全关。ESP32 复位、非法帧、重复序列和 USB 断开同样进入全关。
- 雾化只保留模拟预览；完成独立 MOSFET、湿润、防干烧和人工脉冲验收后才能制定真实输出接线。
