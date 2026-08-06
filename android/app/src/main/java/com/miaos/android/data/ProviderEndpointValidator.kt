package com.miaos.android.data

import java.net.URI

private const val maxProviderEndpointLength = 2000

/**
 * 在保存配置前校验供应商端点元数据，避免把 URL 用户信息或不可控超长文本写入本地配置。
 * Android 生图请求只允许 HTTPS；局域网 HTTP 仅用于一次性 macOS 配对。
 */
fun validateProviderEndpoint(value: String): String {
    val endpoint = value.trim()
    require(endpoint.isNotBlank()) { "供应商 API 地址不能为空" }
    require(endpoint.length <= maxProviderEndpointLength) { "供应商 API 地址长度不能超过 $maxProviderEndpointLength" }
    val uri = try {
        URI(endpoint)
    } catch (_: Exception) {
        throw IllegalArgumentException("供应商 API 地址格式不正确")
    }
    require(uri.scheme.equals("https", ignoreCase = true)) { "供应商 API 地址必须使用 HTTPS" }
    require(uri.userInfo == null) { "供应商 API 地址不能包含用户信息" }
    require(!uri.host.isNullOrBlank()) { "供应商 API 地址格式不正确" }
    require(uri.fragment == null) { "供应商 API 地址不能包含片段" }
    return endpoint
}

/** 导入时忽略未知供应商的密钥，避免把孤立密钥写入 Android Keystore。 */
fun knownProviderSecrets(providerIds: List<String>, secrets: Map<String, String>): Map<String, String> {
    val knownIds = providerIds.toSet()
    return secrets.filter { (providerId, value) -> providerId in knownIds && value.isNotBlank() }
}
