# New API 二次开发版

> [!IMPORTANT]
> 本项目是基于 [new-api](https://github.com/QuantumNous/new-api) 进行二次开发的项目，不是 new-api 官方发行版。
> 上游项目由 [QuantumNous](https://github.com/QuantumNous) 及 new-api 社区贡献者维护。本仓库保留上游项目名称、版权、许可证和归属信息。

本项目继承 new-api 的多渠道 AI API 网关能力，并针对渠道调度、服务组、异步任务、运营计费和管理后台进行了扩展。

## 功能统计口径

本文档只列出当前 `HEAD` 相对上游 `官方/main` 仍然存在的功能差异，判断依据是最终代码，而不是某个功能是否曾经出现在 Git 提交中。

```bash
git diff --name-status 官方/main..HEAD
git diff 官方/main..HEAD
```

以下内容不计入二开功能：

- 曾经提交、后来又被恢复或删除的实现；
- 已经由上游实现、当前代码与上游没有差异的功能；
- 只剩提交记录，但当前没有后端接口、前端入口或业务代码的功能；
- 单纯的测试补充、格式调整和上游合并提交。

## 当前保留的二开功能

### 1. 智能渠道调度

- 在相同用户组、模型和优先级下建立独立调度池。
- 支持传统路由与智能调度策略，并允许按用户组覆盖默认策略。
- 结合渠道权重、请求成功率和首字响应时间进行渠道选择。
- 记录渠道请求量、错误、首字延迟和调度事件。
- 按“渠道 + 模型”持久化调度故障，服务重启后仍可恢复状态。
- 支持故障窗口、降权、隔离、自动恢复和手动恢复。
- 自动禁用前检查同级及后备优先级渠道，避免禁用最后一个可用渠道。
- 提供独立的调度管理页面，包括概览卡片、趋势图、首字延迟图、调度池详情和恢复操作。
- 调度概览、设置修改和恢复操作分别受渠道读取、编辑和操作权限控制。

相关接口：

- `GET /api/channel/scheduling/overview`
- `GET /api/channel/scheduling/settings`
- `PUT /api/channel/scheduling/settings`
- `POST /api/channel/scheduling/model/restore`
- `POST /api/channel/scheduling/channel/restore`

### 2. 服务组与路由计费分离

- 新增服务组配置，将用户可见分组与实际渠道路由、计费分组分离。
- 一个用户组可以关联多个可选服务组。
- 渠道可绑定服务组，并按服务组参与模型路由。
- API 密钥只能选择当前用户组允许使用的服务组。
- 用户创建、用户编辑和订阅升级/降级分组统一使用有效用户组校验。
- 普通中转和异步任务日志记录实际结算分组。
- 支持分组说明等元数据，并在管理后台提供可视化编辑。
- 修正用户组充值倍率和无效分组配置的校验。

### 3. 高级自定义上游协议

- 自定义入站路径、上游路径和 HTTP 方法。
- 支持相对地址与绝对上游地址。
- 支持 Bearer、请求头、Query 参数和免认证等认证方式。
- 支持自定义 Header、Query 参数及 `{api_key}`、`{model}`、`{task_id}` 等变量。
- 支持同步 JSON 请求体模板和响应体模板。
- 支持文本、图像、音频等非流式接口的字段转换。
- 支持高级自定义渠道的上游模型列表路由。
- 支持请求和响应 JavaScript 脚本，用于复杂字段转换。
- 路由表达式和脚本能力位于独立的 `relaykit` 模块中。

### 4. 高级自定义异步任务

- 支持视频等异步任务的提交、轮询和最终结果处理。
- 可分别配置提交方法、轮询方法、任务路径和下载请求头。
- 从响应中映射任务编号、状态、进度、结果地址和错误信息。
- 支持上游状态到统一任务状态的映射。
- 支持请求模板、请求脚本、响应脚本和错误路径解析。
- 支持 JSON、表单和 `multipart/form-data` 请求，包括文件字段转发。
- 提交任务时保存路由快照，后续修改渠道配置不会破坏已提交任务。
- 可将上游任务错误转换为对外统一错误，同时为管理员保留脱敏诊断信息。

配置说明见 [docs/advanced-custom-upstreams.md](./docs/advanced-custom-upstreams.md)。

### 5. 按秒计费与价格规则

- 为异步媒体任务增加按秒计费模式。
- 从标准任务请求中读取 `duration` 或 `seconds` 作为计费时长。
- 支持按模型配置默认每秒单价。
- 支持条件价格规则，并按第一条命中的规则结算。
- 条件可读取 JSON、表单及 Multipart 字段。
- 支持等于、不等于、包含、存在性和数值大小比较。
- 可按分辨率、FPS、质量、功能模式等请求参数配置不同单价。
- 预扣费和最终结算使用同一计费模式，并在日志中记录时长、单价和命中规则。
- 价格页和日志详情展示按秒计费信息及价格档位。

### 6. 上游价格同步与模型管理

- 重构上游价格同步页面，支持拉取、筛选、对比和批量同步。
- 按上游厂商筛选价格数据。
- 展示当前值、上游值、差异字段和待同步内容。
- 同步模型倍率、固定价格、端点类型和按秒计费模式。
- 公开价格页支持按分组筛选和排序。
- 新增模型厂商管理对话框，可维护模型厂商信息。
- 增强模型描述和标签解析，在模型列表及价格卡片中统一渲染。
- 模型详情内可直接展示该模型对应的接口参考。

### 7. API 密钥用量与接入信息

- API 密钥列表返回每个密钥今日和最近 30 天的消费额度。
- 桌面表格和移动端列表均展示密钥用量。
- 仪表盘提供 API 密钥用量排行。
- 根据系统地址生成并展示 OpenAI 与 Claude Base URL，支持一键复制。
- API 密钥创建和编辑时校验服务组可用范围。
- 自动分组密钥增加更清晰的分组和跨组重试标记。

相关接口：

- `GET /api/data/token-ranking`
- 原有密钥列表和搜索接口新增 `usage.today`、`usage.last_30_days` 字段。

### 8. 聊天预设增强

- 聊天预设支持单独启用和停用。
- 兼容旧字符串配置和新的结构化配置。
- 支持在聊天链接中替换 `key`、`address`、`theme` 等模板变量。
- 增强 Cherry Studio、Aion UI 和 DeepChat 等客户端配置参数的生成。
- 顶部导航和聊天页面只展示已启用的预设。

### 9. 用户余额与邀请奖励

- 用户管理页增加全部用户余额汇总。
- 用户创建和编辑时使用可分配用户组列表，并校验分组有效性。
- 提供邀请用户列表和充值返利明细。
- 邀请充值返利支持固定额度和百分比两种方式。
- 为充值订单记录返利处理状态，避免重复发放。
- 支持配置邀请额度最低划转门槛。
- 邀请额度划转后记录系统日志并刷新用户缓存。
- 删除受邀用户时重新计算邀请人的有效邀请人数。

相关接口：

- `GET /api/user/self/aff/details`
- 用户列表和搜索接口新增 `total_quota` 汇总字段。

### 10. 用户状态栏接口

- 新增只读状态栏接口 `GET /api/statusline/me`。
- 使用 API Token 鉴权，供外部状态栏、桌面工具或客户端读取当前用户信息。
- 返回内容由专用控制器生成，不需要登录后台页面。

### 11. 发票申请与管理

- 用户可从符合条件的已支付订单中选择订单并申请发票。
- 支持发票抬头、税号、接收邮箱、备注和开票金额校验。
- 支持配置开票项目、税率、最低金额、支付方式及其他开票规则。
- 需要补税或补差时，可通过易支付完成补充支付。
- 用户可查看申请列表、详情、审核状态和文件状态。
- 管理员可审核申请、上传发票文件和删除异常申请。
- 发票文件通过邮件发送，记录发送时间和发送次数，并支持重新发送。

主要接口位于 `/api/invoice/*`，前端入口为 `/invoices`。

### 12. 图像、端点与协议兼容

- 增加 OpenAI Completions、Image Edits、Audio Speech、Audio Transcriptions、Audio Translations、Moderations、Realtime 和 Video 等端点类型及默认路径。
- Playground 增加图像生成和图像编辑中转接口：
  - `POST /pg/images/generations`
  - `POST /pg/images/edits`
- OpenAI 图像编辑支持将 JSON 请求中的 URL、Base64、图片数组和 Mask 转换为上游需要的 Multipart 请求。
- 为 `gpt-image-2`、`image-2` 增加精确自定义尺寸校验和透传。
- 响应组件可安全解析和渲染 Markdown 中的 Base64 `data:image` 图片。
- 完善 Claude 模型采样参数兼容：
  - Thinking 模式固定兼容的 Temperature 并移除冲突参数；
  - 部分 Claude 模型只保留一个采样参数；
  - 新模型可按兼容规则移除不支持的采样参数。
- 视频内容代理支持 `HEAD` 请求。

### 13. Cloudflare 视频分发 Worker

- 提供 `deploy/cloudflare-video-worker` 部署示例。
- 网关生成带有效期的加密视频访问令牌，并重定向到 Worker。
- Worker 按令牌中的私有地址和下载请求头获取视频。
- 支持 `GET`、`HEAD`、Range、条件请求和受控重定向。
- 视频数据无需经过网关服务器转发。

### 14. 上游错误隔离与管理员诊断

- 上游非成功响应统一转换为网关错误，不直接向用户暴露上游状态、密钥、余额或原始响应体。
- OpenAI、Claude 和流式响应保持各自对外协议格式。
- 对外错误包含请求 ID，便于管理员定位问题。
- 对上游响应体中的密钥、Token 等敏感字段进行脱敏和长度限制。
- 管理员日志保存上游状态码、内容类型、渠道和脱敏响应摘要。
- 异步任务日志记录上游状态、映射后状态、错误路径是否命中等诊断信息。
- 普通用户日志会移除 `admin_info`，不会看到管理员诊断数据。

### 15. 日志与用量展示

- 普通中转、绘图和异步任务日志记录并展示客户端 IP。
- 用量详情区分输入、输出、缓存读取、缓存写入、5 分钟缓存写入和 1 小时缓存写入。
- 缓存令牌显示占输入令牌的比例。
- 按秒任务日志展示计费时长、每秒单价和命中档位。
- 新增完整异步任务详情弹窗，展示时间、状态、模型、渠道、费用和失败原因。
- 管理员可查看脱敏后的上游响应与任务映射诊断。

### 16. 管理后台与站点配置

- 重新布局概览页的统计卡片、公告、API 信息、社区入口、性能健康度和可用性面板。
- 调整用户、消费和模型图表，增加排行展示及主题颜色适配。
- 新增自定义导航管理，可配置名称、地址、打开方式和排序。
- 顶部导航增加可配置的“画布”入口，支持当前页面或新标签页打开。
- 支持上传、读取和删除站点 Logo。
- 支持上传群聊二维码，并在概览页展示用户社区入口。
- 群聊二维码可配合后台提醒任务使用。
- 日期时间选择器补充多语言显示和图标交互。

## 构建与部署差异

- Dockerfile 支持通过 `NPM_REGISTRY` 指定 Bun 安装源，并在安装失败时切换备用源。
- 前端开发服务器默认端口调整为 `3001`。
- `docker-compose.yml` 调整为本地镜像、外部 MySQL/Redis、宿主机数据目录和外部 Docker 网络的部署方式。

构建本地镜像：

```bash
docker build -t new-api-local:latest .
```

启动前请根据实际环境修改 `docker-compose.yml` 中的数据库地址、Redis、端口、挂载路径和 `my_network`：

```bash
docker compose up -d
```

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 后端 | Go 1.22+、Gin、GORM v2 |
| 前端 | React 19、TypeScript、Rsbuild、Base UI、Tailwind CSS |
| 数据库 | SQLite、MySQL 5.7.8+、PostgreSQL 9.6+ |
| 缓存 | Redis、内存缓存 |
| 前端包管理 | Bun |

## 本地开发

```bash
# 后端
go run .

# 前端
cd web
bun install
bun run dev
```

## 相关文档

- 上游官方文档：<https://docs.newapi.pro/>
- 模型接口参考：[docs/model-api.md](./docs/model-api.md)
- OpenAPI 文件：[docs/openapi/relay.json](./docs/openapi/relay.json)
- 高级自定义上游：[docs/advanced-custom-upstreams.md](./docs/advanced-custom-upstreams.md)
- RelayKit 说明：[relaykit/README.md](./relaykit/README.md)

## 上游项目与归属声明

本项目为 [new-api](https://github.com/QuantumNous/new-api) 的二次开发版本。

- 上游项目：`new-api`
- 上游组织/作者：[QuantumNous](https://github.com/QuantumNous)
- 上游仓库：<https://github.com/QuantumNous/new-api>
- One API 原始项目：<https://github.com/songquanpeng/one-api>

本仓库的二开功能不代表 QuantumNous 或 new-api 官方立场。部署和运营本项目时，应遵守上游服务商条款及所在地的法律、备案、内容安全、支付和数据合规要求。

## 许可证

本项目继续遵循 [GNU Affero General Public License v3.0](./LICENSE)。

根据上游许可证附加条款，修改版本必须保留适用的作者归属声明，并在提供用户界面时保留指向原项目的可见链接：<https://github.com/QuantumNous/new-api>。

本 README 不改变上游项目、QuantumNous、new-api 社区贡献者及其他依赖项目原有的版权和归属。
