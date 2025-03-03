const axios = require('axios');
const vscode = require('vscode');

// 从配置中读取 apiType 和 apiKey
const openrouterModelDefault = 'google/gemini-2.0-flash-exp:free'; // 默认 openrouter model，可以配置
const apiTypeDefault = 'deepseek'; // 默认使用 deepseek

function getDeepseekConfig(text) {
  const deepseekApiKey = vscode.workspace.getConfiguration('CommentTranslator').get('deepseekApiKey');
  if (!deepseekApiKey) {
    throw new Error('DeepSeek API Key 未配置，请在 VS Code 设置中配置 `commentTranslator.deepseekApiKey`');
  }
  const apiUrl = 'https://api.deepseek.com/chat/completions';
  const requestBody = {
    model: "deepseek-chat",
    messages: [
      {"role": "system", "content": "You are a helpful assistant that translates English text to Chinese."},
      {"role": "user", "content": `将下面的英文翻译为中文：${text}`}
    ],
    stream: false
  };
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${deepseekApiKey}`
  };
  return { apiUrl, requestBody, headers };
}

function getOpenrouterConfig(text) {
  const openrouterApiKey = vscode.workspace.getConfiguration('CommentTranslator').get('openrouterApiKey');
  if (!openrouterApiKey) {
    throw new Error('OpenRouter API Key 未配置，请在 VS Code 设置中配置 `commentTranslator.openrouterApiKey`');
  }
  const openrouterModel = vscode.workspace.getConfiguration('CommentTranslator').get('openrouterModel') || openrouterModelDefault;
  const apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
  const requestBody = {
    model: openrouterModel, // 可以配置
    messages: [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": `您是一个专业的翻译人员，你的主要任务是将英文翻译成中文，注意你需要直接翻译出最恰当的文本含义，不要添加冗余信息。将下面的英文翻译为中文：${text}`
          }
        ]
      }
    ]
  };
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${openrouterApiKey}`
  };
  return { apiUrl, requestBody, headers };
}

function getApiConfig(text) {
  // 从 VS Code 配置中读取
  const apiType = vscode.workspace.getConfiguration('CommentTranslator').get('apiType') || apiTypeDefault;

  if (apiType === 'deepseek') {
    return getDeepseekConfig(text);
  } else if (apiType === 'openrouter') {
    return getOpenrouterConfig(text);
  } else {
    throw new Error('Unsupported API type');
  }
}

async function callTranslationAPI(text) {
  const { apiUrl, requestBody, headers } = getApiConfig(text);
  let response = null; // 初始化 response 变量
  // 打印出 apiUrl requestBody headers
  console.log('API call Info url:', apiUrl, "\\nrequestBody:", requestBody, "\\nheaders:", headers);

  try {
    response = await axios.post(apiUrl, requestBody, { headers });
    return response.data;
  } catch (error) {
    console.error('API call url:', apiUrl,  "\\nresponse:", response, "\\nerr:", error);
    throw error;
  }
}

module.exports = {
  callTranslationAPI
};