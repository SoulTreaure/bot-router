/**
 * Bot Router - OpenClaw 跨系统消息路由
 * 
 * 功能：监听飞书群消息，检测 @其他Bot 的消息，将消息转发到对应 Bot 实例处理，
 *       并将处理结果回传到飞书群。
 * 
 * 使用方式：
 * 1. 将本文件放入 OpenClaw workspace
 * 2. 配置 AutoClaw API 端点
 * 3. 创建 cron 任务定期执行
 * 
 * 配置项：
 *   - targetBots: 目标 Bot 列表（name, instanceUrl, apiToken, accountId）
 *   - autoClawApi: AutoClaw 实例的 API 端点（http://127.0.0.1:28789）
 *   - feishuGroupId: 监听的飞书群 ID
 */

const https = require('https');
const http = require('http');

// ============ 配置区 ============

/**
 * 目标 Bot 配置
 * 每个 Bot 对应一个独立的 OpenClaw 实例
 */
const targetBots = [
    {
        name: "默默",
        instanceUrl: "http://127.0.0.1:28789",  // AutoClaw 实例地址
        apiEndpoint: "/v1/chat/completions",   // OpenAI 兼容 API
        apiToken: "YOUR_AUTH_TOKEN",             // 认证 Token
        feishuAppId: "cli_aa9b2ddd2c789bd3"     // 飞书 App ID
    }
];

/**
 * 飞书 Bot 配置（当前实例）
 */
const currentBot = {
    feishuAppId: "cli_aa81a6ff9b799bc",
    feishuAppSecret: "YOUR_FEISHU_SECRET",
    groupId: "oc_group_xxx"  // 群 ID
};

// ============ 工具函数 ============

/**
 * HTTP 请求封装
 */
function httpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;
        
        const reqOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };
        
        const req = client.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve(data);
                }
            });
        });
        
        req.on('error', reject);
        if (options.body) {
            req.write(options.body);
        }
        req.end();
    });
}

/**
 * 获取飞书 Access Token
 */
async function getFeishuAccessToken() {
    const response = await httpRequest('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            app_id: currentBot.feishuAppId,
            app_secret: currentBot.feishuAppSecret
        })
    });
    return response.tenant_access_token;
}

/**
 * 获取群消息
 */
async function getGroupMessages(accessToken, containerId, pageToken = null) {
    const params = new URLSearchParams({
        container_id_type: 'chat',
        container_id: containerId,
        page_size: '20',
        sort_type: 'ByCreateTimeDesc'
    });
    if (pageToken) params.set('page_token', pageToken);
    
    const url = `https://open.feishu.cn/open-apis/im/v1/messages?${params}`;
    return httpRequest(url, {
        headers: { 
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });
}

/**
 * 获取消息内容
 */
async function getMessageDetail(accessToken, messageId) {
    const url = `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}`;
    return httpRequest(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
}

/**
 * 发送消息到群
 */
async function sendMessage(accessToken, chatId, content) {
    const url = `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`;
    return httpRequest(url, {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            receive_id: chatId,
            msg_type: 'text',
            content: JSON.stringify({ text: content })
        })
    });
}

/**
 * 调用目标 Bot 的 OpenAI 兼容 API
 */
async function callTargetBot(bot, message, sender) {
    const url = `${bot.instanceUrl}${bot.apiEndpoint}`;
    
    try {
        const response = await httpRequest(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bot.apiToken}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                    { 
                        role: "system", 
                        content: `这是一条来自飞书群的消息，发送者是 ${sender}。请以你的身份回复这条消息。` 
                    },
                    { role: "user", content: message }
                ],
                max_tokens: 2000,
                temperature: 0.8
            })
        });
        
        return response.choices?.[0]?.message?.content || '处理失败：无响应内容';
    } catch (error) {
        return `调用失败：${error.message}`;
    }
}

// ============ 主逻辑 ============

/**
 * 处理消息路由
 */
async function routeMessage(message, sender, mentions) {
    const tasks = [];
    
    for (const mentionedBot of mentions) {
        const target = targetBots.find(b => b.name === mentionedBot);
        if (target) {
            tasks.push({
                bot: target,
                message: message,
                sender: sender
            });
        }
    }
    
    if (tasks.length === 0) {
        return null;
    }
    
    const results = [];
    for (const task of tasks) {
        const response = await callTargetBot(task.bot, task.message, task.sender);
        results.push(`【${task.bot.name}】\n${response}`);
    }
    
    return results.join('\n\n');
}

/**
 * 解析消息中的 @ 提及
 */
function parseMentions(messageContent) {
    const mentions = [];
    // 匹配 @xxx 格式
    const regex = /@([^\s@]+)/g;
    let match;
    while ((match = regex.exec(messageContent)) !== null) {
        mentions.push(match[1]);
    }
    return mentions;
}

/**
 * 主入口函数（供 cron 调用）
 */
async function main() {
    try {
        console.log('[Bot Router] 开始处理...');
        
        // 1. 获取飞书 Access Token
        const accessToken = await getFeishuAccessToken();
        
        // 2. 获取最新消息
        const messagesResponse = await getGroupMessages(accessToken, currentBot.groupId);
        
        if (!messagesResponse.data || !messagesResponse.data.items) {
            console.log('[Bot Router] 无新消息');
            return;
        }
        
        // 3. 处理每条新消息
        for (const msg of messagesResponse.data.items) {
            // 跳过自己发送的消息
            if (msg.sender?.sender_id?.open_id === currentBot.feishuAppId) {
                continue;
            }
            
            // 获取消息详情
            const detail = await getMessageDetail(accessToken, msg.message_id);
            const content = JSON.parse(detail.data?.content || '{}');
            const messageText = content.text || '';
            
            // 解析 @ 提及
            const mentions = parseMentions(messageText);
            if (mentions.length === 0) continue;
            
            // 获取发送者信息
            const senderName = msg.sender?.sender_id?.open_id || '未知用户';
            
            console.log(`[Bot Router] 检测到 @消息: ${mentions.join(', ')}`);
            
            // 路由消息
            const response = await routeMessage(messageText, senderName, mentions);
            if (response) {
                // 发送回复到群
                await sendMessage(accessToken, currentBot.groupId, response);
                console.log('[Bot Router] 回复已发送');
            }
        }
        
        console.log('[Bot Router] 处理完成');
        
    } catch (error) {
        console.error('[Bot Router] 错误:', error.message);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main();
}

module.exports = { main, routeMessage, parseMentions };
