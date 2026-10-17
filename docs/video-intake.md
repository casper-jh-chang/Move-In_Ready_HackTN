# 视频预审入库：设计与使用说明

捐赠者用手机绕着家具拍一段 30 到 60 秒的短视频，边拍边口头介绍。系统从画面和语音里提取品类、成色、尺寸、瑕疵和取件信息，按 House2Home 的“收与不收”规则给出 **接收 / 拒收（附原因和替代去处）/ 转人工**。识别出的每件家具直接作为待审核捐赠写进网站的 MySQL 库存，管理员在“Donation review”里看视频、确认或改判。

网页入口：捐赠者登录后，在 **My donations** 页点 **Donate with a video**，或者在普通捐赠表单里点 **AI video intake**。

## 流程

```
手机录像 + 浏览器实时字幕（Web Speech API）
        │  上传视频 + 字幕
        ▼
ffprobe 读时长 → 按时间等分成 8 段，每段挑最清晰的一帧（边缘方差，避开运动模糊）
        │
        ├─ video 模式：把整段视频压成 480p（带音轨）直接发给能看视频、听声音的模型（OCI 上的 Gemini）
        └─ frames 模式：8 张关键帧 + 文字稿发给图像模型（OCI 上的 Llama 4 等）
        │
        ▼
多模态模型只做“提取事实”，输出结构化 JSON：
  每件物品：品类、房间、数量、材质、颜色、品牌、年限、尺寸（口述/估计）、成色等级和 1–5 分、
           瑕疵列表（类型、严重程度、位置、证据来源=看到/说到/都有、时间点）、是否沙发床、
           拍到了哪些面、最佳展示时间点、置信度
  整段视频：文字稿、摘要、家里有无宠物/吸烟、楼层/电梯、是否需要拆装、
           口述和画面的矛盾、补拍建议
        │
        ▼
规则引擎（确定性代码，不用 AI）逐条判定，并记录触发了哪条规则
        │
        ▼
在模型给出的时间点重新截帧（主图 + 每个瑕疵一张图），结果存成 result.json
        │
        ▼
网页上每件家具一张卡片：名称、品类已预填，AI 判定和原因、瑕疵截图（点一下跳到视频对应秒数）
捐赠者确认或修改，取消勾选不想捐的，选取件区域，提交
        │
        ▼
Express（app/server/vision.cjs）重新向视频服务读取这次的识别结果（并核对是不是这位捐赠者的），
写入 MySQL furniture 表：status = pending，AI 结果存在 vision_result，主图存在 photo
        │
        ▼
管理员在 Donation review 看到 AI 判定；点 Approve / Reject 可以看视频、规则原因和瑕疵截图，
拒收理由会预填规则给出的原因和建议去处。最终决定始终由管理员做。
```

## 为什么这样设计

- **AI 只描述，不做决定。** 收不收由 `vision-service/rules/house2home.json` 里的规则决定，每条拒收都能指到具体规则编号。换一家家具银行，只要换一份规则文件。
- **画面和语音互相印证。** 瑕疵记录证据来源；捐赠者说“没有污渍”但画面里有，会进入“矛盾”列表并转人工。
- **证据不足就转人工，不硬判。** 置信度低于 0.6、拍到的面少于 3 个、无法确认是不是沙发床，都会转人工，并提示捐赠者补拍什么。
- **每个结论都能回看。** 瑕疵带时间点，后台点一下就跳到视频对应位置。
- **录制时有引导。** 画面上按时间提示“正面 → 左侧 → 背面 → 右侧 → 掀开坐垫和细节 → 口述年限、宠物、楼层”，减少补拍。

## 规则一览（摘自 `house2home.json`）

| 编号 | 触发条件 | 结果 |
|---|---|---|
| CAT-BED | 床垫、床架、床头板 | 拒收 |
| CAT-SLEEPER | 沙发床（品类或 `is_sleeper=true`） | 拒收 |
| CAT-APPLIANCE / CAT-TVSTAND / CAT-ELECTRONICS / CAT-CURTAINS / CAT-CLOTHING / CAT-MEDICAL | 对应品类 | 拒收 |
| CAT-BEDDING | 床品，除非确认是全新未拆封 | 转人工 |
| CAT-ASNEEDED / CAT-SIZE / CAT-UNKNOWN | 书桌、衣柜、转角沙发、未知品类 | 转人工 |
| CHK-SLEEPER | 普通沙发但无法确认不是沙发床 | 转人工 |
| DEF-* | 霉、虫、水渍：任何程度；污渍、破损、缺件、宠物损坏、异味、塌陷：中度以上；划痕等：严重 | 拒收 |
| DEF-STAIN-MINOR | 布艺家具上的轻微污渍 | 转人工 |
| DEF-REPAIR / DEF-POOR | 需要维修，或整体成色差 | 拒收 |
| HH-SMOKE / HH-PETS | 布艺家具来自吸烟或养宠家庭 | 转人工 |
| EV-CONF / EV-VIEWS / EV-CONFLICT | 置信度低 / 拍摄角度不足 / 口述与画面矛盾 | 转人工 |

## 运行

需要 Node 16.20+、MySQL 8、Python 3.11+、ffmpeg。

```bash
# 1. 视频识别服务
cd vision-service
pip install -r requirements.txt
cp .env.example .env          # 默认 VISION_PROVIDER=mock，不需要任何模型

# 2. 网站（MySQL 的建库步骤见 app/README.md）
cd ../app
npm install
cp .env.example .env          # 填 MYSQL_*；VISION_SERVICE_URL 默认 http://127.0.0.1:8000
npm run db:init
npm run dev:video             # 同时启动视频服务 :8000、API :3001、网页 :5173
```

用 donor1@demo.org / demo1234 登录捐赠者，admin@demo.org / demo1234 登录管理员。视频服务没启动时，网站其他功能照常可用，视频弹窗会提示怎么启动。

手机上用摄像头需要 HTTPS（或 localhost），演示时可以用 ngrok 之类的隧道。

测试：`cd vision-service && python -m pytest -q`

### 不接云服务演示（mock 模式）

mock 模式按关键词返回预设结果，关键词可以来自口述字幕，也可以来自上传的文件名：

| 说到 / 文件名包含 | 结果 |
|---|---|
| `sleeper`、`pull-out`、`沙发床` | 沙发床 → 拒收 |
| `stain`、`dirty`、`污` | 有中度污渍的单人沙发 → 拒收 |
| `dresser`、`drawer`、`柜` | 橡木五斗柜 → 接收 |
| `table`、`chair`、`桌`、`椅` | 餐桌 + 4 把椅子（一段视频两件物品）→ 接收 |
| 其他 | 灰色三人布艺沙发 → 接收 |

### 用本地模型（不需要云账号）

视觉模型跑在 [Ollama](https://ollama.com/download) 里，语音用 faster-whisper，都在自己电脑上。

```bash
# 1. 装 Ollama（官网下载安装包），然后拉一个视觉模型
ollama pull qwen2.5vl:7b        # 约 6 GB；电脑慢可以用 qwen2.5vl:3b

# 2. 装本地语音转写
cd vision-service
pip install -r requirements-local.txt
```

`vision-service/.env`：

```
VISION_PROVIDER=ollama
OLLAMA_MODEL=qwen2.5vl:7b
TRANSCRIBE_PROVIDER=local
WHISPER_MODEL_SIZE=small
```

然后照常 `npm run dev:video`。

- 本地模型只看图，所以固定走 frames 模式：8 张关键帧加文字稿。文字稿优先用浏览器的实时字幕；上传的视频没有字幕时，用 Whisper 从音轨转写。Whisper 模型第一次用时会自动下载（`small` 约 460 MB）。
- 速度取决于电脑：有独立显卡或 Apple Silicon 时一段视频大约几十秒，纯 CPU 可能要几分钟。太慢可以把 `NUM_KEYFRAMES` 调到 4 到 6，把 `OLLAMA_IMAGE_PX` 调到 448，或者设 `FRAMES_AS_SHEET=true`，把所有帧拼成一张图只发一次。
- 小模型的识别能力比云端大模型弱，尤其是细小的污渍和沙发床的结构。结果不确定时规则会转人工，这是正常的。
- 报错 “Ollama is not running” 就先运行 `ollama serve`；报错 “model not found” 就先 `ollama pull` 对应的模型。

### 接 OCI Generative AI

在 `vision-service/.env` 里：

```
VISION_PROVIDER=oci
INPUT_MODE=video
OCI_COMPARTMENT_ID=ocid1.compartment.oc1..你的
OCI_GENAI_ENDPOINT=https://inference.generativeai.us-chicago-1.oci.oraclecloud.com
OCI_MODEL_ID=google.gemini-2.5-flash
```

认证用 `~/.oci/config`（`oci setup config` 生成）。

- **video 模式（推荐）**：一次请求同时处理画面和声音，不需要单独的语音识别服务。模型要支持视频输入，例如 OCI 上的 Gemini 2.5。
- **frames 模式**：`INPUT_MODE=frames`，模型换成 `meta.llama-4-maverick-17b-128e-instruct-fp8` 等图像模型。语音用浏览器实时字幕；没有字幕时可设 `TRANSCRIBE_PROVIDER=openai` 走 Whisper 兼容接口。用 `llama-3.2` 视觉模型时会自动把 8 帧拼成一张带时间标签的九宫格，因为它每次只收一张图。

> 还没有用真实 OCI 账号跑过。请求结构已经按 OCI Python SDK 的格式核对过，第一次接入时请注意：所选区域是否提供该模型、内联视频的大小限制、模型是否稳定输出 JSON（代码会剥掉 ```json 代码块，解析失败自动重试一次）。

## 接口

网站（Express，`app/server/index.cjs`）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/vision/status` | 视频服务是否在线、用的什么模型、是否缺 ffmpeg |
| POST | `/api/vision/video` | 仅捐赠者。multipart：`video`、`transcript`。返回每件家具的 AI 结果和预填字段 |
| POST | `/api/furniture` | 原有的提交捐赠接口，多了可选的 `vision: {intakeId, itemIndex}` |
| GET | `/api/vision/media/*` | 视频和截图，供 `<img>`/`<video>` 使用；路径含随机 128 位 id |

视频服务（FastAPI，只给 Express 调用，不要直接暴露到公网）：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/analyze` | multipart：`video`、`transcript` |
| GET | `/intake/{id}` | 读取已保存的识别结果 |
| GET | `/health` | 模型、模式、缺少的工具 |
| GET | `/media/...` | 播放用视频、关键帧、瑕疵截图 |

## 代码位置

```
app/src/pages/VideoIntake.tsx  录制/上传、拍摄引导、实时字幕、识别结果、提交；管理员看到的 AI 面板
app/src/pages/Donor.tsx        两个入口：My donations 页的按钮、捐赠表单里的 AI video intake
app/src/pages/Admin.tsx        审核卡片和 Approve/Reject 弹窗里显示 AI 结果
app/server/vision.cjs          转发视频、品类映射、预填字段、校验归属、存 vision_result
vision-service/app/video.py      ffmpeg：探测、挑清晰帧、截帧、抽音频、压缩、九宫格
vision-service/app/prompts.py    给模型的提示词（只提取事实，附 JSON Schema）
vision-service/app/providers.py  OCI / Ollama 本地 / OpenAI 兼容 / mock 四种模型后端，本地 Whisper，JSON 解析
vision-service/app/schema.py     模型输出和判定结果的数据结构
vision-service/app/rules.py      规则引擎
vision-service/rules/house2home.json  规则、替代去处、各品类估重
vision-service/app/pipeline.py   串起整个流程，结果存成 result.json
vision-service/app/main.py       HTTP 接口
```

## 后续可以做

- 异步处理加进度推送（现在是同步请求，真实模型大约要 10 到 40 秒）。
- 视频和截图存到 OCI Object Storage；`deploy.sh` 目前只部署网站，视频服务还要单独部署。
- 让 AI 估的尺寸参考画面里的已知物体（门框、A4 纸）提高精度。
- 用 20 到 30 段真实风格的测试视频做准确率评估（品类、沙发床、污渍的召回率）。
