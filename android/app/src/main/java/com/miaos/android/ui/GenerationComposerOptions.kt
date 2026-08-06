package com.miaos.android.ui

private val standardGenerationRatios = listOf("1:1", "4:3", "3:4", "16:9", "9:16")
private val standardGenerationQualities = listOf("高清", "标准")

/**
 * 保留用户从历史记录或供应商配置中带入的自定义值，避免切换预设面板时悄悄覆盖参数。
 */
fun generationRatioOptions(selected: String): List<String> = selected.asComposerOption(standardGenerationRatios)

/** 保留自定义质量，同时提供与 macOS 一致的常用预设。 */
fun generationQualityOptions(selected: String): List<String> = selected.asComposerOption(standardGenerationQualities)

private fun String.asComposerOption(defaultOptions: List<String>): List<String> =
    trim().takeIf { it.isNotBlank() }
        ?.let { selected -> listOf(selected) + defaultOptions.filterNot { it == selected } }
        ?: defaultOptions
