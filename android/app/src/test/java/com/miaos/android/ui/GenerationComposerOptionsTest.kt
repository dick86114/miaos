package com.miaos.android.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class GenerationComposerOptionsTest {
    @Test
    fun `自定义比例会保留在创作面板的比例选项首位`() {
        assertEquals(
            listOf("21:9", "1:1", "4:3", "3:4", "16:9", "9:16"),
            generationRatioOptions("21:9"),
        )
    }

    @Test
    fun `预设质量会保留当前的自定义质量`() {
        assertEquals(
            listOf("超清", "高清", "标准"),
            generationQualityOptions("超清"),
        )
    }
}
