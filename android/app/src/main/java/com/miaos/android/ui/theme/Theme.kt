package com.miaos.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val MiaosLightColors = lightColorScheme(
    primary = Color(0xFF4F46E5),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE8E8FF),
    onPrimaryContainer = Color(0xFF29235C),
    secondary = Color(0xFF4B5563),
    onSecondary = Color.White,
    background = Color(0xFFF4F4F6),
    onBackground = Color(0xFF111827),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF111827),
    surfaceVariant = Color(0xFFF0F0F3),
    onSurfaceVariant = Color(0xFF4B5563),
    outline = Color(0xFFE5E7EB),
    error = Color(0xFFEF4444),
)

private val MiaosDarkColors = darkColorScheme(
    primary = Color(0xFF818CF8),
    onPrimary = Color.White,
    primaryContainer = Color(0xFF30336C),
    onPrimaryContainer = Color(0xFFE2E5FF),
    secondary = Color(0xFF94A3B8),
    onSecondary = Color(0xFF111827),
    background = Color(0xFF111827),
    onBackground = Color(0xFFF1F5F9),
    surface = Color(0xFF1E293B),
    onSurface = Color(0xFFF1F5F9),
    surfaceVariant = Color(0xFF334155),
    onSurfaceVariant = Color(0xFF94A3B8),
    outline = Color(0xFF334155),
    error = Color(0xFFF87171),
)

/** 主题偏好保存在 Room，未设置或未知值时安全回退到系统模式。 */
@Composable
fun MiaosTheme(themeMode: String = "system", content: @Composable () -> Unit) {
    val useDarkTheme = when (themeMode) {
        "dark" -> true
        "light" -> false
        else -> isSystemInDarkTheme()
    }
    MaterialTheme(
        colorScheme = if (useDarkTheme) MiaosDarkColors else MiaosLightColors,
        typography = MiaosTypography,
        content = content,
    )
}
