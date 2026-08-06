package com.miaos.android.data

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProviderModelValidationTest {
    @Test
    fun `文本模型供应商可以在没有图像模型时保存`() {
        assertTrue(hasAnyProviderModel(emptyList(), listOf("text-model")))
    }

    @Test
    fun `图像和文本模型都为空时拒绝保存`() {
        assertFalse(hasAnyProviderModel(emptyList(), emptyList()))
    }
}
