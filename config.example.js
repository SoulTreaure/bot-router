/**
 * Bot Router 配置示例
 */

module.exports = {
    // 目标 Bot 列表
    targetBots: [
        {
            name: "默默",
            instanceUrl: "http://127.0.0.1:28789",
            apiEndpoint: "/v1/chat/completions",
            apiToken: "YOUR_AUTH_TOKEN",
            feishuAppId: "cli_aa9b2ddd2c789bd3"
        }
    ],
    
    // 当前 Bot 配置
    currentBot: {
        feishuAppId: "cli_aa81a6ff9b799bc",
        feishuAppSecret: "YOUR_FEISHU_SECRET",
        groupId: "YOUR_GROUP_ID"
    }
};
