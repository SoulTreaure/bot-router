# Bot Router

> OpenClaw 跨系统 Bot 消息路由插件

## 功能

实现不同 OpenClaw 实例间的消息转发，让分布在多个系统上的 AI Bot 能在同一个飞书群里协同工作。

## 架构

```
飞书群
  ↓ @目标Bot 的消息
QClaw (当前实例)
  ↓ 检测到 @其他Bot
  ↓ HTTP POST /v1/chat/completions
AutoClaw (目标实例)
  ↓ 处理并回复
  ↓ 返回 response
QClaw
  ↓ 转发回复到飞书群
飞书群 ← 用户看到目标Bot的回复
```

## 配置

### 1. 配置目标 Bot

编辑 `bot_router_cron.js`，在 `targetBots` 数组中添加目标 Bot：

```javascript
const targetBots = [
    {
        name: "默默",
        instanceUrl: "http://127.0.0.1:28789",
        apiEndpoint: "/v1/chat/completions",
        apiToken: "YOUR_AUTH_TOKEN",
        feishuAppId: "cli_xxx"
    }
];
```

### 2. 配置当前 Bot

```javascript
const currentBot = {
    feishuAppId: "cli_yyy",
    feishuAppSecret: "YOUR_FEISHU_SECRET",
    groupId: "oc_group_xxx"
};
```

### 3. 创建 Cron 任务

在 QClaw 中创建定时任务，每分钟执行一次。

## 使用

### 在飞书群中

- `@BotA 你好` → BotA 会收到消息并回复
- `@BotB 帮我查一下天气` → BotB 会处理并回复
- `@BotA @BotB 你们好` → 两个 Bot 都会回复

## 文件说明

- `bot_router_cron.js` - 主程序，包含路由逻辑
- `config.example.js` - 配置示例
- `package.json` - Node.js 项目配置

## License

MIT
