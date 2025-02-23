## 调试
启动调试会打开一个vscode窗口，在这个窗口中会自动加载此插件，直接使用插件就行。
在原项目vscode中，修改代码后，在调试打开的窗口中`reload window`即可生效。

## 打包
修改`package.json`中的`version`字段，新版本。

```shell
npm install -g vsce # 如果安装了 跳过
vsce package # 打包 生成 .vsix 文件
```
