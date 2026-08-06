package com.miaos.android.data

import java.util.Base64
import java.nio.charset.StandardCharsets
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/** 与 macOS `.miaos` 协议 v1 对齐的 Android 加密实现。 */
object MiaosConfigCrypto {
    const val format = "miaos-config"
    const val version = 1
    const val defaultIterations = 600000

    private const val saltBytes = 16
    private const val ivBytes = 12
    private const val keyBits = 256
    private const val tagBits = 128
    private const val tagBytes = tagBits / 8

    fun decryptPayload(envelope: ConfigEnvelope, password: CharArray): String {
        try {
            require(envelope.format == format) { "配置格式不支持" }
            require(envelope.version <= version) { "配置版本过高，请升级妙生" }
            require(envelope.version == version) { "配置版本不支持" }
            require(envelope.kdfName == "PBKDF2-HMAC-SHA256") { "配置加密算法不支持" }
            require(envelope.cipherName == "AES-256-GCM") { "配置加密算法不支持" }
            require(envelope.iterations in 100000..2000000) { "配置加密参数不正确" }

            val salt = decode(envelope.salt)
            val iv = decode(envelope.iv)
            val tag = decode(envelope.tag)
            val ciphertext = decode(envelope.payload)
            require(salt.size == saltBytes) { "配置盐值不正确" }
            require(iv.size == ivBytes) { "配置初始化向量不正确" }
            require(tag.size == tagBytes) { "配置认证标签不正确" }

            val key = deriveKey(password, salt, envelope.iterations)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(tagBits, iv))
            cipher.updateAAD(ByteArray(0))
            val plaintext = cipher.doFinal(ciphertext + tag)
            return plaintext.toString(StandardCharsets.UTF_8)
        } catch (error: Exception) {
            if (error.message == "配置格式不支持" || error.message == "配置版本过高，请升级妙生") {
                throw error
            }
            throw IllegalArgumentException("配置解密失败")
        }
    }

    fun deriveKey(password: CharArray, salt: ByteArray, iterations: Int): SecretKeySpec {
        val spec = PBEKeySpec(password, salt, iterations, keyBits)
        return try {
            val bytes = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                .generateSecret(spec)
                .encoded
            SecretKeySpec(bytes, "AES")
        } finally {
            spec.clearPassword()
        }
    }

    fun randomSalt(): ByteArray = ByteArray(saltBytes).also(SecureRandom()::nextBytes)

    private fun decode(value: String): ByteArray = Base64.getUrlDecoder().decode(value)
}

data class ConfigEnvelope(
    val format: String,
    val version: Int,
    val kdfName: String,
    val iterations: Int,
    val salt: String,
    val cipherName: String,
    val iv: String,
    val tag: String,
    val payload: String,
)
