package com.miaos.android.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class ImageMediaActionsTest {
    @Test
    fun `按扩展名生成可保存到相册的图片 MIME 类型`() {
        assertEquals("image/jpeg", imageMimeType("photo.JPG"))
        assertEquals("image/webp", imageMimeType("photo.webp"))
        assertEquals("image/png", imageMimeType("photo.png"))
    }
}

class GalleryPermissionRequirementTest {
    @Test
    fun `仅 Android 9 及以下写入相册需要旧版存储权限`() {
        assertEquals(true, requiresLegacyGalleryPermission(28))
        assertEquals(false, requiresLegacyGalleryPermission(29))
        assertEquals(false, requiresLegacyGalleryPermission(36))
    }
}
