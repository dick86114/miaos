package com.miaos.android.ui.components

import org.junit.Assert.assertEquals
import org.junit.Test

class MiaosIllustrationTest {
    @Test
    fun `空态符号映射到稳定的产品插图`() {
        assertEquals(MiaosIllustration.SEARCH, emptyStateIllustrationKind("⌕"))
        assertEquals(MiaosIllustration.PROJECTS, emptyStateIllustrationKind("▧"))
        assertEquals(MiaosIllustration.HISTORY, emptyStateIllustrationKind("◷"))
        assertEquals(MiaosIllustration.CREATE, emptyStateIllustrationKind("其他"))
    }
}
