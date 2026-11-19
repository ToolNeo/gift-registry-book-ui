# 礼簿模块维护入口

- 前端模块：[src/modules/gift-registry-manager-ui](src/modules/gift-registry-manager-ui/README.md)。
- 后端仓库：[ToolNeo/gift-registry-book](https://github.com/ToolNeo/gift-registry-book)。
- 稳定接口：[礼簿 API](https://github.com/ToolNeo/gift-registry-book/blob/main/docs/gift-registry/API.md)。
- 维护说明：[开发文档](https://github.com/ToolNeo/gift-registry-book/blob/main/docs/gift-registry/DEVELOPMENT.md)。
- 邮箱验证：[账号与邮件配置](https://github.com/ToolNeo/gift-registry-book/blob/main/docs/account-email-verification.md)。

管理工作台 `/gift-registry` 与活动管理 `/gift-registry/events` 需要登录并受资源动作和创建者数据权限控制。独立展示 `/gift-registry/display/:eventId` 使用活动只读令牌，与管理会话隔离。

展示端每两秒通过 HTTP 查询版本，有变更时取得分页快照。姓名和人民币大写金额保持单个竖列并按长度缩字，底部数字金额横排保留两位小数；活动类型决定婚礼、大寿或丧事样式。

微信仅是人工登记选项，无支付接入或二维码。到场人数独立于礼金笔数；同名只在当前活动内提示，不合并。礼金明细导出为真正的 `.xlsx` 文件。活动仅在结束后可删除，整场删除需确认并由后端再次校验权限和版本。

代码修改应保持整数分金额、事务和幂等、展示只读令牌、已确认成功后顶部反馈，以及断网保留最后画面等已有边界。具体字段及行为以模块说明和后端接口文档为准。
