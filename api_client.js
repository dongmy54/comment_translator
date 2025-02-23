const axios = require('axios');

// 假设 apiType 和 apiKey 从配置中读取
const openrouterModel = 'google/gemini-2.0-flash-exp:free'; // 默认 openrouter model，可以配置
const apiType = 'deepseek'; // 默认使用 deepseek
const deepseekApiKey ='xx'; // 示例，实际应从配置读取
const openrouterApiKey = 'yy'; // 示例，实际应从配置读取

function getApiConfig(apiType, text) {
  let apiUrl = '';
  let requestBody = {};
  let headers = {
    'Content-Type': 'application/json',
  };

  if (apiType === 'deepseek') {
    apiUrl = 'https://api.deepseek.com/chat/completions';
    requestBody = {
      model: "deepseek-chat",
      messages: [
        {"role": "system", "content": "You are a helpful assistant that translates English text to Chinese."},
        {"role": "user", "content": `将下面的英文翻译为中文：${text}`}
      ],
      stream: false
    };
    headers['Authorization'] = `Bearer ${deepseekApiKey}`;
  } else if (apiType === 'openrouter') {
    apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    requestBody = {
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
    headers['Authorization'] = `Bearer ${openrouterApiKey}`;
  } else {
    throw new Error('Unsupported API type');
  }

  return { apiUrl, requestBody, headers };
}

async function callTranslationAPI(text) {
  const { apiUrl, requestBody, headers } = getApiConfig(apiType, text);

  try {
    const response = await axios.post(apiUrl, requestBody, { headers });
    return response.data;
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

module.exports = {
  callTranslationAPI
};