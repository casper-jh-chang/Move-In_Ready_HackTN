# Move-In Ready *（暂定名）*

[English](README.md) | 中文

**HackathonTN 2026 · Track 1：From Surplus to Social Good · ChineseCanFly 队**

有人搬走，留下还能用的家具；有人刚结束无家可归的日子，搬进空荡荡的新家。Move-In Ready 把前者的家具送到后者手里，不让它们进填埋场。整个设计围绕 **[House2Home Nashville](https://www.house2homenashville.org/)** 的真实流程。这是一家全部由志愿者运营的家具银行。我们用 **OCI Generative AI** 接手最耗志愿者时间的人工环节，但最终决定始终由人来做。

**在线 Demo：** https://163-192-199-117.sslip.io（演示账号见下文，密码 `demo1234`）

> 当前状态（2026-10-18）：可以在 Oracle Cloud 上端到端运行的原型。捐赠者用照片或环绕视频提交家具，OCI AI 做初筛，管理员审批，志愿者按道路优化路线取件和配送，受助者按需申请。详见[已完成的功能](#已完成的功能)和[路线图](#路线图)。本项目只使用合成数据。我们和 House2Home 没有隶属关系，也不使用任何真实的客户或捐赠者信息。

---

## 问题

**纳什维尔的垃圾填埋场快满了。** Davidson County 的生活垃圾大多运到 Middle Point 填埋场，预计 2028 到 2029 年前后满载。纳什维尔没有路边大件垃圾回收，搬家后留下的家具通常交给清运公司，最后还是进了填埋场。

**另一边，刚脱离无家可归状态的人搬进的是空房子。** House2Home 免费为他们提供全新的床和八成新的家具，客户由 100 多家合作机构的社工转介。整个机构靠 Google Forms、Google Docs、2 辆厢式货车，以及一个每周只开放 3 小时的仓库运转。

我们根据 House2Home 官网和公开表单，梳理出以下瓶颈：

| 痛点 | 现状 |
|---|---|
| **取件慢** | 捐赠者至少要提前 2 周通知，实际常排 2 到 4 周。搬家的人等不了这么久。 |
| **审核靠人工** | 捐赠者用自由文本列出家具，照片另外发邮件。志愿者要逐件对照详细的“收与不收”清单来判断。 |
| **白跑一趟** | 污渍、沙发床、需要维修的物品，常常到了现场才发现（*我们的推断，有待核实*）。 |
| **匹配靠人脑** | 转介需求和仓库存货分别记在不同的 Google Docs 里，依赖少数几位关键志愿者。 |
| **司机是最大瓶颈** | 同一批志愿者既要取件又要送货，路线也没有合并。 |
| **进度不透明** | 社工不知道转介能不能配齐，也不知道什么时候能送到。 |
| **床要花钱买** | 不收二手床，每张床（约 $400 到 $500，床品另需约 $75）都要用募来的现金购买。 |

完整分析：[docs/house2home-analysis.md](docs/house2home-analysis.md) · 前期调研：[docs/needs-research.md](docs/needs-research.md)

---

## 已完成的功能

| 功能 | 做什么 | 对应痛点 |
|---|---|---|
| **照片扫描** | 捐赠者提交照片后，**OCI AI Vision** 识别物体，**OCI Generative AI**（Llama 4 Maverick）写出状况报告：物品类型、成色、可见问题，以及和填写的品类是否一致。结果以标记的形式显示在管理员的审核卡片上。 | 审核靠人工 |
| **视频预审** | 捐赠者录制或上传一段 30 到 60 秒的环绕视频并口头介绍。ffmpeg 挑出 8 张清晰的关键帧，口述内容来自浏览器实时字幕或 Whisper，一次 Generative AI 调用列出每件物品、缺陷（带时间点）、是否沙发床以及拍到了哪几面。再由**确定性的规则引擎**（[`house2home.json`](vision-service/rules/house2home.json)）给出**接收**、**转人工**或**拒收**，写明触发的规则，并为拒收的物品推荐其他去处（例如 Habitat for Humanity ReStore）。一段视频可以生成多条预填好的捐赠。 | 审核靠人工、白跑一趟 |
| **管理员审核** | 管理员能看到照片扫描或视频的结论、视频本身、规则原因，以及可以跳到对应秒数的缺陷截帧。拒收时自动填好规则给出的原因。 | 审核靠人工 |
| **库存流转** | 每件物品从*待审核 → 已批准（已认捐，仍在捐赠者家）→ 在库 → 已送达*全程跟踪，并记在捐赠者名下。 | 匹配靠人脑 |
| **申请** | 受助者浏览已批准的家具并提出申请。管理员为每件物品批准一个申请，其余申请自动婉拒。 | 进度不透明 |
| **志愿者任务和路线规划** | 管理员分派取件和配送。每位志愿者的所有站点在真实道路上（OSRM）排成一趟往返，显示在地图上，并标出比逐趟单独跑节省的距离，附“导航”链接。捐赠者可以填写街道地址，地址解析后得到精确的站点。 | 司机是最大瓶颈 |
| **影响页面** | 已送达和在途的公斤数、服务的户数、活跃的捐赠者和志愿者人数、完成的趟数。 | 买床的资金 |

共有四种角色：**捐赠者**、**受助者**（user）、**志愿者**和**管理员**，所有权限都由服务端控制。详见 [app/README.md](app/README.md)（英文）。

### 演示账号（密码 `demo1234`）

| 角色 | 邮箱 |
|---|---|
| 管理员 | admin@demo.org |
| 志愿者 | volunteer1@demo.org、volunteer2@demo.org |
| 捐赠者 | donor1@demo.org、donor2@demo.org、donor3@demo.org |
| 受助者 | user1@demo.org、user2@demo.org |

30 秒演示脚本和准备清单：[docs/demo-guide.md](docs/demo-guide.md)。

---

## 路线图

还没做的部分，大致按优先级排列：

1. **社工转介和家具包。** LLM 把社工的转介表（勾选项，加上“客户坐轮椅，住三楼，没电梯”这类补充说明）转成结构化需求，再用库存和已认捐的物品给每户配一套**家具包**并标出缺口：缺床就提示动用买床基金，缺小件就加进当月的认捐清单。目前受助者只能逐件申请。
2. **更聪明的路线。** 考虑货车容量和时间窗（例如用 OR-Tools），把取件和配送合并成“社区集中取件日”，并给司机生成通俗易懂的任务单。
3. **进度通知。** 用邮件和多种语言给社工和捐赠者发“已受理 / 已配齐 / 预计某日送达”的通知。
4. **影响故事。** 用 OCI Generative AI 把影响数据写成 House2Home 可以拿给资助方的故事，帮他们募款买床。
5. **保留熟悉的表单。** 接入 House2Home 现有的 Google Forms，合作机构不用学新工具。
6. **运维。** 找回密码；OCI 上改用 instance principal 认证，不再存放 API key；视频存到 OCI Object Storage。

---

## 负责任 AI

- **人来做决定。** AI 只描述看到的内容，规则引擎给出建议，每一件捐赠都由管理员批准或拒收，不会自动通过。
- **结果可解释。** 每个视频结论都写明是哪条规则导致的，并附上缺陷截帧作为证据，捐赠者和志愿者都能看到原因。
- **AI 不能自己下结论。** 照片扫描的 prompt 要求模型忽略图片里写的文字。服务端会从视频服务重新读取结论，并检查它属于提交的捐赠者，浏览器无法伪造结论。
- **服务顺序不交给 AI。** 先服务谁按透明的规则决定，不由模型判断。
- **隐私优先。** 捐赠者和受助者互相看不到对方的信息，地址只有需要的工作人员才能看到。数据库放在私有子网里，Demo 只用合成数据。
- **低门槛。** 捐赠者可以拍段视频说几句，不用填长表单。路线图里还计划保留合作机构已经在用的 Google Forms。

---

## 成功指标

- 从捐赠者提交到完成取件的天数
- 到现场才发现不能收的取件比例（目标：接近 0）
- 志愿者审核每件捐赠所花的时间
- 每趟车处理的件数
- 配齐的户数，以及没能服务到的转介数
- 免于填埋的重量

---

## 落地与推广

- **先在 House2Home 试点。** 他们的“收与不收”规则明确、有文字记录，很适合自动预审。
- **按机构配置。** 收与不收的规则、替代去处和估重都在一个 JSON 文件里（[`house2home.json`](vision-service/rules/house2home.json)），不用改代码。用哪个 AI 模型也只是一项配置。
- **每个城市都有家具银行。** 同样的流程适用于全美各地的家具银行，也适用于校园搬离季、酒店、写字楼等大量剩余物资的来源。

---

## 技术栈

| 层 | 选择 |
|---|---|
| 前端 | React + TypeScript + Vite，Leaflet 地图 |
| 后端 | Express API（Node）+ Python FastAPI 视频服务，部署在 OCI Compute 虚拟机（Oracle Linux 9）上，前面是带 HTTPS 的 Apache |
| AI | OCI Generative AI（Llama 4 Maverick 多模态）+ OCI AI Vision；语音用 Whisper。开发时可用 `mock` 或用 Ollama 跑本地模型 |
| 路线规划 | OSRM 道路路线 + OpenStreetMap（Leaflet 地图），Nominatim 地址解析 |
| 数据 | OCI 上的 MySQL HeatWave，放在私有子网（合成演示数据） |
| 基础设施 | OCI Resource Manager（Terraform）栈；用 `app/deploy.sh` 重新部署 |

```
浏览器 ──HTTPS──► Apache ──► Express API ──────────► MySQL HeatWave（私有子网）
                                 │   └─ 照片扫描 ──► OCI AI Vision + OCI Generative AI
                                 └─► FastAPI 视频服务 ──► OCI Generative AI
                                     （ffmpeg、Whisper、规则引擎）
```

Oracle Cloud 各部分的用法和配置见 [docs/oracle-cloud.md](docs/oracle-cloud.md)（英文）。

## 本地运行

需要 Node 16.20+、MySQL 8、Python 3.11+ 和 ffmpeg。默认的 `mock` 模式不需要任何云账号。

网站在 `app/` 目录（React + Express + MySQL，安装步骤见 [app/README.md](app/README.md)）。AI 视频识别是 `vision-service/` 里一个单独的 Python 服务：

```bash
cd vision-service && pip install -r requirements.txt && cp .env.example .env
cd ../app && npm install && cp .env.example .env && npm run db:init
npm run dev:video     # 同时启动视频服务 :8000、API :3001、网页 :5173
```

然后打开 http://localhost:5173，用上面的[演示账号](#演示账号密码-demo1234)登录。

选择 AI：

| 配置项 | 位置 | 可选值 |
|---|---|---|
| `VISION_PROVIDER` | `vision-service/.env` | `mock`（默认，固定答案）、`ollama`（本地模型，如 `qwen2.5vl:7b`）、`oci` |
| `INPUT_MODE` | `vision-service/.env` | `frames`（关键帧 + 文字稿，线上使用）或 `video`（整段视频，需要 Gemini 这类视频模型） |
| `OCI_*` | `app/.env`、`vision-service/.env` | 照片扫描和 OCI 模式，都读取 `~/.oci/config` |

本地模型、接入 OCI 和规则表见 [docs/video-intake.md](docs/video-intake.md)。在笔记本上用 Ollama 分析一段视频要几分钟；用 OCI 分析一段 12 秒的视频约 5 秒。

## 测试

- `cd vision-service && python -m pytest -q`：规则引擎、模型输出解析、mock 流程
- `cd app && npx tsc --noEmit`：前端类型检查
- [docs/test-report.md](docs/test-report.md)（英文）：线上站点的端到端测试结果（4 种角色、权限、照片扫描、视频预审、路线、手机布局）和已知问题

## 已知限制

- **AI 会出错。** 我们测试时，视觉模型有时会声称看到了视频根本没拍到的面，或者把带软垫的扶手椅认成普通椅子。所以规则引擎倾向于给出**转人工**，每个决定都由管理员来做。
- **路线规划要每位志愿者有多个站点才能看出节省。** 演示数据里每位志愿者只有一个任务，所以显示节省 0%。
- **线上没开整段视频模式。** 我们租户的 Gemini 配额是 0，所以线上用的是关键帧 + Llama 4 Maverick。
- 道路路线和地址解析用的是免费的公共 OSRM 和 Nominatim 服务器，有频率限制。OSRM 不可用时，路线规划会退回直线距离。

---

## 待向 House2Home 核实的问题

我们正在联系 House2Home 团队（[外联邮件草稿](docs/h2h-outreach-email.md)），想核实这些假设：

1. 最大的瓶颈是司机和车、仓库空间，还是收到的东西不对路？
2. 到现场才发现不能收的情况有多频繁？
3. 每月收到多少份转介？有多少没能服务到？
4. 现在怎么决定先服务谁？
5. 他们想要新工具，还是更希望继续用 Google Forms，只在后台加一层智能处理？

## 团队

**ChineseCanFly：** Jiaheng Chang · Yuchen Xie · Guanchen Du · Yinhong Cui · Jiaxiao Dong

## 仓库结构

```
docs/
  hackathon-info.md         各 track 说明和评审重点
  needs-research.md         纳什维尔本地需求调研
  house2home-analysis.md    House2Home 流程拆解
  h2h-outreach-email.md     外联邮件草稿
  video-intake.md           视频预审：设计、规则、运行说明
  oracle-cloud.md           OCI 的用法：GenAI、AI Vision、MySQL HeatWave、Compute、配置（英文）
  test-report.md            功能测试结果和已知问题（线上站点，英文）
  demo-guide.md             30 秒演示方案和准备清单（英文）
app/                        网站：React 前端、Express API、MySQL（捐赠者、管理员、志愿者、受助者）
  src/pages/                每种角色一个页面（Donor、Admin、Volunteer、Recipient）+ VideoIntake
  server/index.cjs          API 路由和权限
  server/vision.cjs         把视频转给视频服务，保存识别结果
  server/photo-scan.cjs     单张照片扫描：OCI AI Vision + OCI Generative AI
  server/oci.cjs            用 ~/.oci/config 里的 API key 给 OCI REST 请求签名
  server/geo.cjs            地址解析（Nominatim）和道路路线（OSRM）
  server/schema.sql         MySQL 表结构；db.cjs 启动时自动应用它和迁移
  deploy.sh                 构建并重新部署到 OCI Compute 虚拟机
vision-service/
  app/                      FastAPI：ffmpeg 抽帧、多模态模型（mock/Ollama/OCI）、规则引擎
  rules/house2home.json     收与不收规则、替代去处、估重
  tests/                    pytest 测试
```
