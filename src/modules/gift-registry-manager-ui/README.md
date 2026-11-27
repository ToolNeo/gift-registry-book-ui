# 电子礼簿前端模块

本模块是现场礼金登记工作台和宾客展示屏。后续修改先读取仓库根目录的 [GIFT-REGISTRY.md](../../../GIFT-REGISTRY.md)，其中提供后端仓库、稳定接口和开发文档入口。代码中的 API 类型是前端消费边界，不替代跨端契约。

## 入口与权限

- 管理工作台：`/gift-registry`，登录且具有 `gift-registry:query`；写入操作需 `gift-registry:save`。
- 管理动作另受服务端创建者/ALL数据范围控制，默认仅本人创建活动；菜单按 `gift-event` 元数据配置creator/all，角色授权保存后需正确回显。同一动作多个授权合并时ALL优先，query/save/delete的范围分别生效；普通ADMIN不豁免，历史owner为空活动仅持久身份匹配的最高内置管理员可见。前端不按姓名、角色名或已知活动ID自行放宽范围。
- 活动管理与礼金明细列表均显示“创建时间”，使用已有 `createdAt` 按 `YYYY-MM-DD HH:mm:ss` 展示，缺失显示 `--`。仅在服务端额度响应的当前用户身份为 `EXEMPT` 时显示“创建用户”，位于创建时间之后、操作列之前，缺失显示 `--`，长姓名沿用省略与悬浮查看。普通账号、VIP 和 ALL 数据范围不会触发创建用户列；字段只用于管理列表，不加入公开展示、导出或创建/更正输入。
- 独立活动管理：通过菜单配置 `gift-registry/Manage`，默认地址 `/gift-registry/events`；名称、位置、地址、显示及授权由菜单配置管理，不自动补入菜单或注册固定路由。入口需query、创建及修改需save、删除需delete。列表“新建活动”和“活动设置”在当前页打开与礼簿工作台共享的活动表单，保存后刷新当前列表，保留菜单、地址、筛选条件与分页；原礼簿创建/编辑入口和“打开礼簿”跳转保留。创建/编辑日期使用与搜索相同的Ant Design日期选择器，仍以YYYY-MM-DD日期字符串提交，不新增时间或范围字段。
- `proto.admin.username`（默认 `admin`）对应且持久ID/username匹配的已启用内置管理员账号自动拥有全部启用资源动作，以及数据库已有启用菜单和按钮；普通角色仍需显式delete grant，既有角色grant不自动扩张。非空菜单表仍不会自动补Manage元数据，须通过现有菜单管理流程配置。活动管理仅使用服务端配置的菜单，前端不补充导航或授予后端删除能力。加载新代码需重新启动后端，并重新登录刷新会话。
- 礼簿菜单组件代码：`gift-registry/Event`。导航仅使用服务端授权菜单，不自动补充礼簿入口；登录后按菜单排序打开第一个可用页面，无可用菜单时进入个人中心。
- 独立展示：`/gift-registry/display/:eventId#token=...`。生成的完整链接可反复打开。页面消费 fragment 后立即移除，按活动存入当前标签页的 `sessionStorage`。重新粘贴同活动的新令牌也会生效。
- 展示REST走平台 `publicRequest`，仅使用 `X-Gift-Display-Token`，移除管理token和Cookie，不初始化管理会话。当前页面用2秒HTTP版本轮询，不创建WebSocket连接；后端WS端点仍保留。

## 主要代码

| 路径 | 职责 |
| --- | --- |
| `api/index.ts`、`types/index.ts` | 受控管理API、公开展示REST、R10-r1增量契约（继承R5-r1业务规则与R9快照分页） |
| `hooks/useWorkspace.ts` | 有界活动分页、活动切换、明细筛选、服务端有效统计、过期请求隔离 |
| `hooks/useEntryEditor.ts` | 精确同名提醒、更正原因、独立到场人数、确定 / 不确定保存结果及幂等重试 |
| `hooks/useEventSettings.ts` | 活动与展示配置草稿、本地照片预览与保存、展示链接、备份与恢复 |
| `hooks/useEventManagement.ts`、`views/EventManagementView.vue` | 独立活动管理、状态操作及权限/确认删除 |
| `hooks/useDisplay.ts` | 2秒版本轮询、canonical快照分页、恢复补载/断线保留、撤销清屏和卸载取消 |
| `components/EntryForm.vue` | 无请求副作用的礼金表单与同名记录核对 |
| `components/EventFormModal.vue` | 活动列表与礼簿工作台共享的新建/编辑表单、十类型样式及放大预览 |
| `components/DisplayBook.vue` | 无请求副作用的活动信息区及竖排礼簿，可复用于配置预览 |
| `views/WorkspaceView.vue`、`views/DisplayView.vue` | 管理 / 展示路由容器与页面区域组合 |
| `utils/money.ts`、`utils/files.ts` | 元字符串与整数分、人民币大写、照片解码与备份文件 |
| `utils/display-link.ts` | 按活动缓存、校验本应用的完整 fragment 展示链接 |
| `themes.ts`、`assets/fonts/` | 十类活动的预设入口、本地手写字体、OFL 许可与官方来源 |
| `locales.ts` | 中文、英文文案 |

## 不可隐式改变的业务规则

1. 微信仅为人工选择的支付方式；保存不发起任何支付通信。
2. 同名按当前活动内 trim 后精确匹配，包含作废记录；更正排除自身。提醒后允许继续保存，不合并。
3. `attendeeCount=null` 是未登记，`0` 是无人到场。人数、礼金笔数、金额分别读取服务端统计。
4. 金额输入按十进制字符串转换为整数分，不执行浮点乘法或隐式四舍五入。
5. 新登记不确定是否成功时保留原请求标识和原负载，锁定输入后重试。已确认写入后的刷新失败不能再次进入待保存状态。
6. 展示首次用pageIndex=-1读取尾页，此后每2秒轮询version；健康且版本不变时不取snapshot，变更时取canonical快照，不在客户端拼页，也不创建WebSocket。按 `latestEntrySeq` 增长判断新增，并用pageIndex=-1取服务端当前尾页，即使“作废一笔 + 新增一笔”后有效总数相同也跳尾页；单纯更正与手动翻页保持当前页。
7. 慢请求串行不重叠；网络临时失败保留最后成功画面，继续每2秒尝试，恢复时即使版本未变也重新取快照。HTTP403/404清屏并停止轮询。切换活动、token、页码或有效pageSize时取消旧请求并隔离旧响应，卸载取消请求与计时器。
8. 活动照片为解码成功、最多 2 MiB 的 PNG/JPEG/WebP。选择后使用临时 blob URL 预览，取消、换图、切换活动或离开页面时释放；只有保存才通过 `POST /events/{id}/display-settings/photo` 同时提交 file 和 application/json 的 settings，照片与标题、列数一次保存。普通设置及公开快照仅返回 `photoUrl` 文件链接，不传输 base64；链接通过当前 API 地址解析以支持跨域部署。常规 JSON 设置仅保留既有链接或清除照片。内置十种主题仍使用本地 CSS、装饰字与 SVG，只保存活动类型。schemaVersion 1/2 备份另用 `BackupSettings.photoDataUrl` 内嵌照片，旧备份可继续恢复。没有二维码入口或数据字段。
9. 备份恢复创建新活动；原活动不被覆盖，展示令牌不随备份恢复。
10. `eventType` 是结婚 `WEDDING`、丧事 `FUNERAL`、大寿 `BIRTHDAY`、满月酒 `FULL_MOON`、百天酒 `HUNDRED_DAYS`、周岁宴 `FIRST_BIRTHDAY`、订婚宴 `ENGAGEMENT`、乔迁宴 `HOUSEWARMING`、升学宴 `GRADUATION`、开业庆典 `BUSINESS_OPENING` 十种样式的唯一选择值，未独立保存主题。新增初始不选择类型；新增及修改时活动描述 trim 后为 1 至 1024 字。旧活动默认结婚且描述为空时展示省略描述，编辑需补填。
11. 新建表单以草稿实时预览，取消不修改当前活动；创建预览显式将草稿活动名传入settings.title，对应后端已有的新活动默认标题。DisplayBook只渲染settings.title，不再显示活动name，也不以name兜底。展示标题表单trim后1至128字符必填，对齐后端既有@NotBlank/max128。title和描述在左页顶部，照片居中，日期在下；结婚/大寿红底金字，丧事白底墨色，对应列标贺礼/寿礼/奠仪。满月暖粉桃色（月）、百天暖杏金（百）、周岁橙红（岁）、订婚绛红（缘）、乔迁青金（乔）、升学蓝金（学）、开业红金（兴），新增类型的列标均为贺礼。
12. 姓名、人民币大写金额使用本地 Ma Shan Zheng 手写字体，不使用运行时远程字体服务。字体完整授权及来源见 [assets/fonts/README.md](assets/fonts/README.md)。
13. 本浏览器完整展示链接按活动存入 `localStorage` 的 `gift-registry:display-link:<eventId>`，重开设置及刷新优先复用；无缓存时 `_issue` 新增凭据，保留旧链接。只有确认“重置展示链接”才调用 `_rotate` 撤销所有旧链接，成功后替换缓存。达到 100 个并存凭据而无缓存时，仍可显式重置恢复。
14. 操作记录优先展示后端保存的操作者姓名；姓名缺失或等于 ID 时显示“历史操作员”，ID 仅留在 title 中供追踪。弹窗标题同时显示宾客姓名。
15. 导出备份为 schemaVersion 2，前端接受 1 或 2 版本导入，缺少类型、描述的旧文件由后端迁移；不在前端补写虚构描述。
16. 礼簿数据/文件动作确认成功后，使用共享反馈的全局顶部居中toast；位置仅在shared feedback/app main入口统一配置，不在每个动作重复配置。失败、取消或结果未知不报成功；作废提示“作废成功”，不新增单笔礼金删除API；已结束整场活动删除按第19条执行。照片读取仅更新待保存草稿，提示需保存，不冒充已经持久化。
17. 各类列标竖排，原样式字体增加4px；姓名与人民币大写金额各自保持单个竖列，不自动折成多列，根据完整内容的自然尺寸缩字适配并居中，无裁切或内部滚动。标题、描述仍可换行并自动适配；底部数字保持横排、自动适配且居中。容器、内容和本地字体变化后重测，卸载释放观察器及待执行帧。右页不显示姓名上方序号，姓名在列标横框上方、金额在下方；金额区域最底横排阿拉伯数字金额，使用现有formatAmount按整数分精确保留两位小数，不round/trunc或改变中文大写。窄屏按容器宽度请求较小pageSize，实际列数不超过配置；分页可达全部有效记录，空列不显示数字。空列也有横框；主题规则线连续并保留竖分隔与首末封口。横框延伸至book右内缘，不留右padding断口，各主题、不同列数和窄屏都要保持。

18. 礼金导出请求`POST /events/{id}/entries/_export`，仅terms筛选有效，默认当前活动当前筛选全部匹配记录而非当前页。后端固定seq DESC/id ASC，忽略分页/排序/投影，上限10000笔，413 EXPORT_TOO_LARGE整体拒绝。成功为真正xlsx二进制，复用共享binary/download，不把错误JSON当文件；姓名备注为STRING、金额NUMERIC两位、人数null空。
19. 整场活动删除为`DELETE /events/{id}?expectedVersion=正整数`。ACTIVE不可删；CLOSED明确确认后提交，后端delete权限、活动行锁及版本再次校验，事务原子清理audits/entries/displayTokens/event含照片，成功result=true。该行为不改变单笔作废。旧描述为空的状态操作引导原设置补资料，不虚构描述。

20. 管理Workspace、EventManagement及相关弹窗直接继承系统默认主题、字体、表格与表单样式；gift-registry.css仅保留必要的宽度与弹窗滚动约束。六项统计使用系统颜色和间距，突出总额、缩小金额单位，并按屏宽调整列数以完整展示金额。Display保留各类活动预设色彩；婚礼/大寿红金和丧事白墨不变。

21. 创建及备份恢复的归属由后端当前认证身份决定，客户端不提交creatorId；恢复的新活动属于恢复者。公开展示仍使用活动token，宾客不需要管理数据范围。邮箱注册固定normal+MEMBER、不自动登录；已验证邮箱只从 `GET /user/me/email` 判断，旧profile.email不作为验证凭据。首次绑定和改密验证码使用独立用途，不持久化验证码或挑战信息；完整账号接口、SMTP配置及维护规则见后端 `docs/account-email-verification.md`。

## 验证命令

在前端仓库根目录执行：

```sh
pnpm typecheck
pnpm build
pnpm test:gift
pnpm test:gift:e2e
```

`test:gift:e2e` 使用独占本机端口 5189 和本机 Chrome，按冻结接口拦截 HTTP，运行真实路由、表单和客户端。这些场景使用 HTTP fixture，不代表真实后端或邮件投递联调。

原脚手架包含已移除 ProtoHub 模块的历史测试及缺失的 `tools/` 脚本。本次保留这些历史测试，新增 `tsconfig.app.json` 验证实际产品源码，`vitest.gift.config.ts` / `playwright.gift.config.ts` 验证礼簿新增行为；不把礼簿定向通过表述为全部历史测试通过。
