# 视频预审入库：设计与使用说明

捐赠者用手机绕着家具拍一段 30 到 60 秒的短视频，边拍边口头介绍。系统从画面和语音里提取品类、成色、尺寸、瑕疵和取件信息，按 House2Home 的“收与不收”规则给出 **接收 / 拒收（附原因和替代去处）/ 转人工**，并直接写进库存。志愿者在后台确认或改判。

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
在模型给出的时间点重新截帧（主图 + 每个瑕疵一张图）→ 写入 SQLite 库存
  接收 → pledged（已认捐，可参与配对）
  转人工 → needs_review
  拒收 → declined（告诉捐赠者原因和可以去哪里捐）
所有记录都标注“AI 判定、未经志愿者确认”，直到志愿者在后台处理。
```

## 为什么这样设计

- **AI 只描述，不做决定。** 收不收由 `backend/rules/house2home.json` 里的规则决定，每条拒收都能指到具体规则编号。换一家家具银行，只要换一份规则文件。
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

需要 Python 3.11+、Node 18+、ffmpeg。

```bash
# 后端
cd backend
pip install -r requirements.txt
cp .env.example .env          # 默认 VISION_PROVIDER=mock，不需要任何云账号
uvicorn app.main:app --reload --port 8000

# 前端（开发模式，另开一个终端）
cd frontend
npm install
npm run dev                   # http://localhost:5173 ，/api 自动代理到 8000
```

也可以 `npm run build` 后只启动后端，直接访问 http://localhost:8000 。手机上用摄像头需要 HTTPS（或 localhost），演示时可以用 ngrok 之类的隧道。

测试：`cd backend && python -m pytest -q`

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
cd backend
pip install -r requirements-local.txt
```

`backend/.env`：

```
VISION_PROVIDER=ollama
OLLAMA_MODEL=qwen2.5vl:7b
TRANSCRIBE_PROVIDER=local
WHISPER_MODEL_SIZE=small
```

然后照常启动后端和前端。

- 本地模型只看图，所以固定走 frames 模式：8 张关键帧加文字稿。文字稿优先用浏览器的实时字幕；上传的视频没有字幕时，用 Whisper 从音轨转写。Whisper 模型第一次用时会自动下载（`small` 约 460 MB）。
- 速度取决于电脑：有独立显卡或 Apple Silicon 时一段视频大约几十秒，纯 CPU 可能要几分钟。太慢可以把 `NUM_KEYFRAMES` 调到 4 到 6，把 `OLLAMA_IMAGE_PX` 调到 448，或者设 `FRAMES_AS_SHEET=true`，把所有帧拼成一张图只发一次。
- 小模型的识别能力比云端大模型弱，尤其是细小的污渍和沙发床的结构。结果不确定时规则会转人工，这是正常的。
- 报错 “Ollama is not running” 就先运行 `ollama serve`；报错 “model not found” 就先 `ollama pull` 对应的模型。

### 接 OCI Generative AI

在 `backend/.env` 里：

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

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/intake` | multipart：`video`（必填）、`transcript`、`donor_name`、`donor_zip`、`donor_contact`。同步返回整条记录和所有物品 |
| GET | `/api/intake/{id}` | 一次上传的完整结果 |
| GET | `/api/inventory?status=` | 库存列表 |
| PATCH | `/api/inventory/{id}` | 志愿者改状态、备注、标题；改状态即视为已人工确认 |
| GET | `/api/stats` | 各状态数量、估算免于填埋的重量 |
| GET | `/api/config` | 当前使用的模型和模式 |

## 代码位置

```
backend/app/video.py      ffmpeg：探测、挑清晰帧、截帧、抽音频、压缩、九宫格
backend/app/prompts.py    给模型的提示词（只提取事实，附 JSON Schema）
backend/app/providers.py  OCI / Ollama 本地 / OpenAI 兼容 / mock 四种模型后端，本地 Whisper，JSON 解析
backend/app/schema.py     模型输出和判定结果的数据结构
backend/app/rules.py      规则引擎
backend/rules/house2home.json  规则、替代去处、各品类估重
backend/app/pipeline.py   串起整个流程并写库
backend/app/db.py         SQLite 库存
backend/app/main.py       HTTP 接口
frontend/src/Capture.tsx  录制页：摄像头、拍摄引导、实时字幕、上传
frontend/src/IntakeView.tsx  结果页：判定、规则、瑕疵截图、拍摄覆盖面
frontend/src/Inventory.tsx   志愿者后台：筛选、统计、确认或改判
```

## 后续可以做

- 异步处理加进度推送（现在是同步请求，真实模型大约要 10 到 40 秒）。
- 视频和截图存到 OCI Object Storage，库存换成 Autonomous DB。
- 让 AI 估的尺寸参考画面里的已知物体（门框、A4 纸）提高精度。
- 和需求匹配模块对接：pledged 状态的物品直接参与家具包配对。
- 用 20 到 30 段真实风格的测试视频做准确率评估（品类、沙发床、污渍的召回率）。
