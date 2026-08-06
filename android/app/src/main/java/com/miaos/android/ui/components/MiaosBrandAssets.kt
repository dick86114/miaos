package com.miaos.android.ui.components

import androidx.compose.foundation.Image
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import com.miaos.android.R

/** 页面空态和迁移引导使用的本地矢量插图类型。 */
enum class MiaosIllustration {
    CREATE,
    PROJECTS,
    HISTORY,
    SEARCH,
    TRANSFER,
}

/** 将历史空态符号转换为稳定的产品插图类型，兼容既有页面状态模型。 */
internal fun emptyStateIllustrationKind(symbol: String): MiaosIllustration = when (symbol) {
    "⌕" -> MiaosIllustration.SEARCH
    "▧" -> MiaosIllustration.PROJECTS
    "◷" -> MiaosIllustration.HISTORY
    else -> MiaosIllustration.CREATE
}

/** 使用 macOS 现有 Logo 作为 Android 页面中的品牌标识。 */
@Composable
fun MiaosBrandLogo(
    modifier: Modifier = Modifier,
    contentDescription: String = "妙生 Logo",
) {
    Image(
        painter = painterResource(R.drawable.miaos_product_logo),
        contentDescription = contentDescription,
        modifier = modifier,
        contentScale = ContentScale.Fit,
    )
}

/** 使用 APK 内置的 Android VectorDrawable 插图，不依赖网络或外部图片服务。 */
@Composable
fun MiaosIllustrationGraphic(
    illustration: MiaosIllustration,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
) {
    Image(
        painter = painterResource(illustrationResource(illustration)),
        contentDescription = contentDescription,
        modifier = modifier,
        contentScale = ContentScale.Fit,
    )
}

private fun illustrationResource(illustration: MiaosIllustration): Int = when (illustration) {
    MiaosIllustration.CREATE -> R.drawable.ic_miaos_illustration_create
    MiaosIllustration.PROJECTS -> R.drawable.ic_miaos_illustration_projects
    MiaosIllustration.HISTORY -> R.drawable.ic_miaos_illustration_history
    MiaosIllustration.SEARCH -> R.drawable.ic_miaos_illustration_history
    MiaosIllustration.TRANSFER -> R.drawable.ic_miaos_illustration_transfer
}
