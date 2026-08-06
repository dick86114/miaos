package com.miaos.android.ui

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.core.content.FileProvider
import com.miaos.android.data.database.GeneratedImageEntity
import java.io.File

/** 本地图片只会写入用户选择的系统媒体库或通过系统分享面板交给目标应用。 */
object ImageMediaActions {
    fun saveToGallery(context: Context, source: File): Uri {
        require(source.isFile) { "图片文件已不存在" }
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, "miaos_${source.nameWithoutExtension}.${source.extension.ifBlank { "png" }}")
            put(MediaStore.Images.Media.MIME_TYPE, imageMimeType(source.name))
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/妙生")
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
        }
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
            ?: throw IllegalStateException("无法创建相册文件")
        try {
            resolver.openOutputStream(uri)?.use { output -> source.inputStream().use { it.copyTo(output) } }
                ?: throw IllegalStateException("无法写入相册文件")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                resolver.update(uri, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
            }
            return uri
        } catch (error: Exception) {
            resolver.delete(uri, null, null)
            throw error
        }
    }

    fun share(context: Context, source: File) {
        require(source.isFile) { "图片文件已不存在" }
        val contentUri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", source)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = imageMimeType(source.name)
            putExtra(Intent.EXTRA_STREAM, contentUri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "分享生成图片"))
    }
}

/** Android 9 及以下向公共相册写入时仍需运行时存储权限。 */
internal fun requiresLegacyGalleryPermission(apiLevel: Int): Boolean = apiLevel <= Build.VERSION_CODES.P

@Composable
fun MiaosImagePreviewDialog(
    record: GeneratedImageEntity,
    onDismiss: () -> Unit,
    onShare: () -> Unit,
    onSave: () -> Unit,
) {
    val bitmap = remember(record.imagePath) { android.graphics.BitmapFactory.decodeFile(record.imagePath) }
    var scale by remember { mutableFloatStateOf(1f) }
    val transformState = rememberTransformableState { zoomChange, _, _ ->
        scale = (scale * zoomChange).coerceIn(1f, 4f)
    }
    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 0.dp,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(record.prompt, style = MaterialTheme.typography.titleMedium)
                bitmap?.let {
                    Image(
                        bitmap = it.asImageBitmap(),
                        contentDescription = "大图预览",
                        modifier = Modifier
                            .fillMaxWidth()
                            .sizeIn(maxHeight = 620.dp)
                            .transformable(transformState)
                            .graphicsLayer(scaleX = scale, scaleY = scale),
                    )
                    Text("双指缩放查看细节", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } ?: Text("图片文件已不存在", color = MaterialTheme.colorScheme.error)
                Row(modifier = Modifier.fillMaxWidth()) {
                    TextButton(onClick = onShare) { Text("分享") }
                    TextButton(onClick = onSave) { Text("保存到相册") }
                    TextButton(onClick = onDismiss) { Text("关闭") }
                }
            }
        }
    }
}

internal fun imageMimeType(fileName: String): String = when (fileName.substringAfterLast('.', "").lowercase()) {
    "jpg", "jpeg" -> "image/jpeg"
    "webp" -> "image/webp"
    else -> "image/png"
}
