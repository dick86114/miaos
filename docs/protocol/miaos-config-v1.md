# `.miaos` 加密配置协议 v1

## 目标

`.miaos` 是 macOS 与原生 Android 客户端之间迁移供应商配置的加密文件格式。第一阶段只用于本地导入导出和局域网配对，不依赖服务端。

## 顶层格式

文件是 UTF-8 JSON，扩展名为 `.miaos`：

```json
{
  "format": "miaos-config",
  "version": 1,
  "kdf": {
    "name": "PBKDF2-HMAC-SHA256",
    "iterations": 600000,
    "salt": "base64url"
  },
  "cipher": {
    "name": "AES-256-GCM",
    "iv": "base64url",
    "tagLength": 128
  },
  "payload": "base64url"
}
```

`payload` 是 AES-GCM 密文，明文为 UTF-8 JSON。

## 加密规则

1. 每次导出生成新的 16 字节随机 `salt`。
2. 每次导出生成新的 12 字节随机 `iv`。
3. 使用用户输入的导出密码通过 PBKDF2-HMAC-SHA256 派生 32 字节密钥。
4. 使用 AES-256-GCM 加密 payload，并验证认证标签。
5. 密码错误、篡改或格式错误统一返回“配置解密失败”，不返回密钥或明文内容。
6. `iterations` 写入文件，未来可提高参数；导入方必须读取文件中的参数而不能写死。

## payload 白名单

```json
{
  "schemaVersion": 1,
  "providers": [
    {
      "id": "p_grsai",
      "name": "Grsai",
      "type": "grsai",
      "endpoint": "https://...",
      "capabilities": ["image"],
      "imageModels": [],
      "textModels": [],
      "videoModels": []
    }
  ],
  "secrets": {
    "p_grsai": "API Key"
  },
  "defaults": {},
  "themeMode": "system"
}
```

导出前从应用状态中提取白名单字段。历史图片、缓存路径、日志、窗口状态和本机绝对路径不得进入 payload。

## 兼容规则

- `format` 不匹配时拒绝。
- `version` 大于当前支持版本时拒绝并提示升级。
- payload 中未知字段忽略。
- 缺省字段使用 Android 当前默认值。
- provider secret 必须在导入确认后写入 Android Keystore。

## 局域网配对规则

二维码只包含临时地址、随机 token、过期时间和协议版本，不包含 API Key 或配置明文。macOS 端临时服务只在用户主动发起配对时启动，并在成功、取消、超时或窗口关闭后停止。成功传输时应在 HTTP 响应写入完成后立即关闭监听端口，不在剩余 TTL 内继续提供可探测的失效响应。

第一版配对仍传输 `.miaos` 加密信封；Android 需要用户确认设备并输入导出密码。

### 配对确认短码

- macOS 与 Android 都使用一次性 token 的 `SHA-256` 摘要前 3 字节，编码为 6 位大写十六进制短码。
- 短码仅用于用户肉眼核对同一局域网会话；二维码 URL 不增加短码字段，HTTP 请求与供应商请求均不携带短码。
- Android 扫码并完成地址校验后，必须先展示短码。只有用户确认 macOS 面板显示相同短码，才能进入导出密码输入和加密信封读取。
- 短码不包含 API Key、配置明文或可逆密钥材料，也不能替代 token 的一次性访问控制。

后续可增加临时 ECDH 会话加密，但不得因此移除 payload 层加密。
