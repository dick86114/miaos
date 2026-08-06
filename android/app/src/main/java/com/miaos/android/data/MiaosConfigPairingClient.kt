package com.miaos.android.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URI
import java.net.URL
import java.security.MessageDigest

data class PairingUrl(
    val host: String,
    val port: Int,
    val token: String,
) {
    val value: String get() = "http://$host:$port/miaos/pair?token=$token"
    /** 与 macOS 配对面板核对的短码；不进入请求、不包含 API Key。 */
    val confirmationCode: String get() = pairingConfirmationCode(token)

    companion object {
        fun parse(value: String): PairingUrl {
            val uri = try {
                URI(value)
            } catch (_: Exception) {
                throw IllegalArgumentException("二维码配对地址不正确")
            }
            require(uri.scheme == "http") { "二维码配对地址不正确" }
            require(uri.userInfo == null && uri.path == "/miaos/pair") { "二维码配对地址不正确" }
            val host = uri.host ?: throw IllegalArgumentException("二维码配对地址不正确")
            require(host.matches(Regex("""\d{1,3}(?:\.\d{1,3}){3}"""))) { "二维码必须来自局域网 macOS 客户端" }
            val address = try {
                InetAddress.getByName(host)
            } catch (_: Exception) {
                throw IllegalArgumentException("二维码配对地址不正确")
            }
            require(address.hostAddress == host && (address.isSiteLocalAddress || address.isLinkLocalAddress)) {
                "二维码必须来自局域网 macOS 客户端"
            }
            val port = uri.port
            require(port in 1024..65535) { "二维码配对地址不正确" }
            val token = uri.query
                ?.split("&")
                ?.firstOrNull { it.startsWith("token=") }
                ?.removePrefix("token=")
                ?.takeIf { it.matches(Regex("""[A-Za-z0-9_-]{8,256}""")) }
                ?: throw IllegalArgumentException("二维码配对凭据不正确")
            return PairingUrl(host, port, token)
        }
    }
}

/**
 * 扫码成功后先构建待确认状态。只有用户核对短码后，界面才允许读取一次性配对地址。
 * URL 经过 PairingUrl.parse 归一化，避免把未验证的扫码原文带入网络请求。
 */
internal data class PendingPairingConfirmation(
    val url: String,
    val confirmationCode: String,
)

internal fun preparePairingConfirmation(rawUrl: String): PendingPairingConfirmation {
    val pairingUrl = PairingUrl.parse(rawUrl)
    return PendingPairingConfirmation(
        url = pairingUrl.value,
        confirmationCode = pairingUrl.confirmationCode,
    )
}

/** 与 macOS pairingConfirmationCode 保持一致：SHA-256 前 3 字节的大写十六进制。 */
internal fun pairingConfirmationCode(token: String): String {
    require(token.matches(Regex("""[A-Za-z0-9_-]{8,256}"""))) { "二维码配对凭据不正确" }
    return MessageDigest.getInstance("SHA-256")
        .digest(token.toByteArray(Charsets.UTF_8))
        .take(3)
        .joinToString(separator = "") { byte -> "%02X".format(byte.toInt() and 0xff) }
}

/** 下载 macOS 临时配对服务返回的加密信封；不会接受公网或重定向地址。 */
class MiaosConfigPairingClient {
    suspend fun download(rawUrl: String): String = withContext(Dispatchers.IO) {
        val pairingUrl = PairingUrl.parse(rawUrl)
        val connection = (URL(pairingUrl.value).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 15000
            readTimeout = 15000
            instanceFollowRedirects = false
            setRequestProperty("Accept", "application/json")
        }
        try {
            val status = connection.responseCode
            if (status != HttpURLConnection.HTTP_OK) {
                throw IllegalArgumentException("配对读取失败，请确认二维码尚未过期且没有被其他设备使用")
            }
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            val response = JSONObject(body)
            if (!response.optBoolean("ok") || response.optString("protocol") != "miaos-config-pair") {
                throw IllegalArgumentException("配对响应不正确")
            }
            response.optString("encryptedConfig").takeIf { it.isNotBlank() }
                ?: throw IllegalArgumentException("配对配置为空")
        } finally {
            connection.disconnect()
        }
    }
}
