package com.miaos.android.data

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.miaos.android.data.database.MiaosDatabase
import org.junit.Assert.assertSame
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MiaosDatabaseInstanceInstrumentedTest {
    @Test
    fun 同一应用进程复用同一个数据库实例以同步主题和本地状态() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext

        assertSame(MiaosDatabase.create(context), MiaosDatabase.create(context))
    }
}
