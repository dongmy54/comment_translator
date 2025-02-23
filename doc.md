## 调试
启动调试会打开一个vscode窗口，在这个窗口中会自动加载此插件，直接使用插件就行。
在原项目vscode中，修改代码后，在调试打开的窗口中`reload window`即可生效。

## 打包
修改`package.json`中的`version`字段，新版本。

```shell
npm install -g vsce # 如果安装了 跳过
vsce package # 打包 生成 .vsix 文件
```

## 配置

插件支持配置 API 类型和 API 密钥，以便用户可以根据自己的需求选择不同的 API 服务。

### API 类型

目前支持 `deepseek` 和 `openrouter` 两种 API 类型。默认使用 `deepseek`。

- `deepseek`: 使用 DeepSeek API 进行翻译。
- `openrouter`: 使用 OpenRouter API 进行翻译，支持多种模型。

### API 密钥

- `DeepSeek API Key`:  使用 DeepSeek API 时需要配置。
- `OpenRouter API Key`: 使用 OpenRouter API 时需要配置。

### OpenRouter Model 名称

当 API 类型选择 `openrouter` 时，可以配置 OpenRouter Model 名称。
默认使用 `google/gemini-2.0-flash-exp:free`。

### 如何配置

1. 打开 VS Code 设置 (`Code` -> `首选项` -> `设置`，或者 `Cmd + ,`)。
2. 在设置搜索框中输入 `Code Comment Translator`。
3. 在 `Code Comment Translator` 设置中，可以配置以下选项：
    - `Api Type`:  选择 API 类型 (`deepseek` 或 `openrouter`)。
    - `Deepseek Api Key`:  输入 DeepSeek API Key。
    - `Openrouter Api Key`:  输入 OpenRouter API Key。
    - `Openrouter Model`:  输入 OpenRouter Model 名称 (仅当 API 类型为 `openrouter` 时生效)。

