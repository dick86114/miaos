package com.miaos.android.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.miaos.android.ui.EmptyStatePresentation

/** 复用 macOS 空态的“插图 + 清晰说明 + 就近操作”信息层级。 */
@Composable
internal fun MiaosEmptyState(
    presentation: EmptyStatePresentation,
    modifier: Modifier = Modifier,
    onAction: (() -> Unit)? = null,
) {
    MiaosCard(modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            MiaosIllustrationGraphic(
                illustration = emptyStateIllustrationKind(presentation.symbol),
                modifier = Modifier.fillMaxWidth().height(96.dp),
                contentDescription = null,
            )
            Text(
                presentation.title,
                modifier = Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center,
            )
            Text(
                presentation.description,
                modifier = Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            if (presentation.actionLabel != null && onAction != null) {
                Button(
                    onClick = onAction,
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                ) { Text(presentation.actionLabel) }
            }
        }
    }
}
