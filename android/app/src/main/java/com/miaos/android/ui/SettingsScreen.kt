package com.miaos.android.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.miaos.android.data.DefaultGenerationSettings
import com.miaos.android.data.ImportedConfig
import com.miaos.android.data.MiaosConfigImporter
import com.miaos.android.data.configImportPreview
import com.miaos.android.data.ProviderModelOption
import com.miaos.android.data.parseProviderModelOptions
import com.miaos.android.data.hasAnyProviderModel
import com.miaos.android.data.toJson
import com.miaos.android.data.validateProviderEndpoint
import com.miaos.android.data.MiaosConfigPairingClient
import com.miaos.android.data.preparePairingConfirmation
import com.miaos.android.data.MiaosConfigRepository
import com.miaos.android.data.MiaosSecretStore
import com.miaos.android.data.database.MiaosDatabase
import com.miaos.android.data.database.ProviderEntity
import com.miaos.android.generation.ProviderConnectionClient
import com.miaos.android.generation.RemoteProviderModel
import com.miaos.android.ui.components.MiaosCard
import com.miaos.android.ui.components.MiaosPageHeader
import com.miaos.android.ui.components.MiaosFilterChip
import com.miaos.android.ui.components.MiaosPrimaryAddAction
import com.miaos.android.ui.components.MiaosBrandLogo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

@Composable
fun SettingsScreen(
    modifier: Modifier = Modifier,
    providerOnly: Boolean = false,
) {
    val context = LocalContext.current
    val secretStore = remember { MiaosSecretStore(context.applicationContext) }
    val database = remember { MiaosDatabase.create(context.applicationContext) }
    val repository = remember { MiaosConfigRepository(database, secretStore) }
    val scope = rememberCoroutineScope()
    val providers by database.providerDao().observeAll().collectAsState(initial = emptyList())
    val themeMode by database.preferenceDao().observeValue("themeMode").collectAsState(initial = "system")
    val defaultsJson by database.preferenceDao().observeValue("defaults").collectAsState(initial = "{}")
    val defaults = remember(defaultsJson) { DefaultGenerationSettings.fromJson(defaultsJson) }
    val pairingClient = remember { MiaosConfigPairingClient() }
    val connectionClient = remember { ProviderConnectionClient() }
    val scanner = remember {
        GmsBarcodeScanning.getClient(
            context,
            GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .enableAutoZoom()
                .build(),
        )
    }
    var showPasswordDialog by remember { mutableStateOf(false) }
    var showPairingConfirmationDialog by remember { mutableStateOf(false) }
    var selectedUri by remember { mutableStateOf<Uri?>(null) }
    var pairingUrl by remember { mutableStateOf<String?>(null) }
    var pendingPairingUrl by remember { mutableStateOf<String?>(null) }
    var pairingConfirmationCode by remember { mutableStateOf<String?>(null) }
    var status by remember { mutableStateOf("可从 macOS 安全迁移配置，也可以在此设备本地管理供应商。") }
    var password by remember { mutableStateOf("") }
    var importError by remember { mutableStateOf<String?>(null) }
    var pendingImportedConfig by remember { mutableStateOf<ImportedConfig?>(null) }
    var providerForEdit by remember { mutableStateOf<ProviderEntity?>(null) }
    var showProviderEditor by remember { mutableStateOf(false) }
    var providerForDelete by remember { mutableStateOf<ProviderEntity?>(null) }
    var providerForModelManagement by remember { mutableStateOf<ProviderEntity?>(null) }
    var defaultModelPicker by remember { mutableStateOf<DefaultModelCategory?>(null) }

    fun clearConfigImportSource() {
        selectedUri = null
        pairingUrl = null
        pendingPairingUrl = null
        pairingConfirmationCode = null
    }

    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            selectedUri = uri
            pairingUrl = null
            pendingPairingUrl = null
            pairingConfirmationCode = null
            importError = null
            showPasswordDialog = true
        }
    }

    com.miaos.android.ui.components.MiaosPageColumn(
        modifier = modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
    ) {
        MiaosPageHeader(
            title = if (providerOnly) "供应商" else "设置",
            subtitle = if (providerOnly) "管理本地供应商、连接测试和模型启用状态。"
            else "所有供应商请求均从 Android 设备直连，密钥只保存在 Android Keystore。",
        )

        if (!providerOnly) {
            MiaosCard {
                Text("外观", style = MaterialTheme.typography.titleMedium)
                Text("选择主题偏好后立即生效。", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    themeModeSegmentItems(themeMode.orEmpty()).forEach { item ->
                        MiaosFilterChip(
                            label = item.label,
                            selected = item.isSelected,
                            onClick = {
                                if (!item.isSelected) {
                                    scope.launch {
                                        repository.saveThemeMode(item.value)
                                        status = "已切换为${item.label}"
                                    }
                                }
                            },
                            modifier = Modifier.weight(1f),
                            trailingIcon = null,
                        )
                    }
                }
            }

            MiaosCard {
                val imageOptions = providers.enabledModelOptions(ModelCategory.IMAGE)
                val textOptions = providers.enabledModelOptions(ModelCategory.TEXT)
                Text("默认模型", style = MaterialTheme.typography.titleMedium)
                Text("快速生图和提示词优化会优先使用这里配置的模型。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedButton(
                    onClick = { defaultModelPicker = DefaultModelCategory.IMAGE },
                    enabled = imageOptions.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                ) {
                    Text("默认生图：${imageOptions.firstOrNull { it.providerId == defaults.defaultImageProvider && it.modelId == defaults.defaultImageModel }?.displayName ?: "未设置"}")
                }
                OutlinedButton(
                    onClick = { defaultModelPicker = DefaultModelCategory.TEXT },
                    enabled = textOptions.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                ) {
                    Text("默认文本：${textOptions.firstOrNull { it.providerId == defaults.defaultTextProvider && it.modelId == defaults.defaultTextModel }?.displayName ?: "未设置"}")
                }
                if (imageOptions.isEmpty()) Text("没有启用的图像模型。", modifier = Modifier.padding(top = 8.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                if (textOptions.isEmpty()) Text("没有启用的文本模型；提示词优化不可用。", modifier = Modifier.padding(top = 4.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            MiaosCard {
                Text("配置迁移", style = MaterialTheme.typography.titleMedium)
                Text("导入 .miaos 加密文件，或扫描 macOS 的一次性局域网配对二维码。", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Button(
                    onClick = { launcher.launch(arrayOf("application/json", "application/octet-stream", "*/*")) },
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                ) { Text("导入加密配置文件") }
                OutlinedButton(
                    onClick = {
                        scanner.startScan()
                            .addOnSuccessListener { barcode ->
                                try {
                                    val pending = preparePairingConfirmation(barcode.rawValue.orEmpty())
                                    selectedUri = null
                                    pairingUrl = null
                                    pendingPairingUrl = pending.url
                                    pairingConfirmationCode = pending.confirmationCode
                                    importError = null
                                    showPairingConfirmationDialog = true
                                } catch (error: Exception) {
                                    clearConfigImportSource()
                                    status = error.message ?: "二维码配对地址不正确"
                                }
                            }
                            .addOnFailureListener { error ->
                                status = error.message ?: "二维码扫描失败"
                            }
                    },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                ) { Text("扫描 macOS 配对二维码") }
            }

            MiaosCard {
                val appInfo = remember(context) {
                    val versionName = context.packageManager
                        .getPackageInfo(context.packageName, 0)
                        .versionName
                        .orEmpty()
                    appInfoSummary(versionName)
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    MiaosBrandLogo(
                        modifier = Modifier.size(52.dp),
                        contentDescription = "妙生产品 Logo",
                    )
                    Column {
                        Text("应用与数据安全", style = MaterialTheme.typography.titleMedium)
                        Text(appInfo.title, modifier = Modifier.padding(top = 4.dp), style = MaterialTheme.typography.bodyMedium)
                    }
                }
                Text(
                    "密钥保护：${appInfo.keyStorage}",
                    modifier = Modifier.padding(top = 8.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "网络边界：${appInfo.networkBoundary}",
                    modifier = Modifier.padding(top = 4.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        MiaosCard {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("供应商", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "${providers.size} 个本地供应商；新建和编辑均不会把 API Key 写入普通数据库。",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                MiaosPrimaryAddAction("新增") {
                    providerForEdit = null
                    showProviderEditor = true
                }
            }

            providers.forEach { provider ->
                MiaosCard(
                    modifier = Modifier.padding(top = 12.dp),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(14.dp),
                ) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(provider.name, style = MaterialTheme.typography.titleSmall)
                            Text(
                                provider.endpoint,
                                modifier = Modifier.padding(top = 3.dp),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            )
                        }
                        MiaosFilterChip(
                            label = provider.type.uppercase(),
                            selected = false,
                            onClick = {},
                            enabled = false,
                            trailingIcon = null,
                        )
                    }
                    Text(
                        "已启用 ${provider.enabledImageModelCount()} 个图像模型 · ${provider.enabledTextModelCount()} 个文本模型",
                        modifier = Modifier.padding(top = 8.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    FlowRow(
                        modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        MiaosFilterChip("编辑", selected = false, onClick = {
                            providerForEdit = provider
                            showProviderEditor = true
                        }, trailingIcon = null)
                        MiaosFilterChip("模型", selected = false, onClick = {
                            providerForModelManagement = provider
                        }, trailingIcon = null)
                        MiaosFilterChip(
                            if (provider.type.equals("grsai", ignoreCase = true)) "测试（最小请求）" else "测试连接",
                            selected = false,
                            onClick = {
                                scope.launch {
                                    try {
                                        status = "正在测试 ${provider.name}…"
                                        status = connectionClient.testConnection(provider, secretStore.get(provider.id).orEmpty())
                                    } catch (error: Exception) {
                                        status = error.message ?: "供应商连接测试失败"
                                    }
                                }
                            },
                            trailingIcon = null,
                        )
                        MiaosFilterChip("拉取图像模型", selected = false, onClick = {
                            scope.launch {
                                try {
                                    status = "正在拉取 ${provider.name} 的图像模型…"
                                    val models = connectionClient.fetchImageModels(provider, secretStore.get(provider.id).orEmpty())
                                    repository.replaceImageModels(provider, models.toRemoteImageModelsJson())
                                    status = "已更新 ${models.size} 个图像模型"
                                } catch (error: Exception) {
                                    status = error.message ?: "拉取模型失败"
                                }
                            }
                        }, trailingIcon = null)
                        MiaosFilterChip("拉取文本模型", selected = false, onClick = {
                            scope.launch {
                                try {
                                    status = "正在拉取 ${provider.name} 的文本模型…"
                                    val models = connectionClient.fetchTextModels(provider, secretStore.get(provider.id).orEmpty())
                                    repository.replaceTextModels(provider, models.toRemoteImageModelsJson())
                                    status = "已更新 ${models.size} 个文本模型"
                                } catch (error: Exception) {
                                    status = error.message ?: "拉取文本模型失败"
                                }
                            }
                        }, trailingIcon = null)
                    }
                    TextButton(
                        onClick = { providerForDelete = provider },
                        modifier = Modifier.padding(top = 4.dp),
                    ) { Text("删除供应商和本地密钥") }
                }
            }
        }

        MiaosCard {
            Text("状态", style = MaterialTheme.typography.titleMedium)
            Text(status, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }

    defaultModelPicker?.let { category ->
        val options = providers.enabledModelOptions(if (category == DefaultModelCategory.IMAGE) ModelCategory.IMAGE else ModelCategory.TEXT)
        DefaultModelPickerDialog(
            title = if (category == DefaultModelCategory.IMAGE) "选择默认生图模型" else "选择默认文本模型",
            options = options,
            selectedProviderId = if (category == DefaultModelCategory.IMAGE) defaults.defaultImageProvider else defaults.defaultTextProvider,
            selectedModelId = if (category == DefaultModelCategory.IMAGE) defaults.defaultImageModel else defaults.defaultTextModel,
            onDismiss = { defaultModelPicker = null },
            onSelect = { option ->
                scope.launch {
                    val next = if (category == DefaultModelCategory.IMAGE) {
                        defaults.copy(defaultImageProvider = option.providerId, defaultImageModel = option.modelId)
                    } else {
                        defaults.copy(defaultTextProvider = option.providerId, defaultTextModel = option.modelId)
                    }
                    repository.saveDefaults(next)
                    status = "已更新${if (category == DefaultModelCategory.IMAGE) "默认生图" else "默认文本"}模型"
                    defaultModelPicker = null
                }
            },
        )
    }

    if (showPairingConfirmationDialog) {
        AlertDialog(
            onDismissRequest = {
                showPairingConfirmationDialog = false
                clearConfigImportSource()
            },
            title = { Text("确认 macOS 配对设备") },
            text = {
                val presentation = pairingConfirmationPresentation(pairingConfirmationCode ?: "------")
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        presentation.hint,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.primaryContainer,
                        contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary),
                    ) {
                        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                            Text(presentation.title, style = MaterialTheme.typography.labelMedium)
                            Text(
                                presentation.code,
                                modifier = Modifier.padding(top = 4.dp),
                                style = MaterialTheme.typography.headlineSmall,
                                fontFamily = FontFamily.Monospace,
                                letterSpacing = 2.sp,
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val confirmedUrl = pendingPairingUrl
                    if (confirmedUrl == null) {
                        showPairingConfirmationDialog = false
                        clearConfigImportSource()
                        status = "配对地址已失效，请重新扫描二维码"
                        return@TextButton
                    }
                    pairingUrl = confirmedUrl
                    pendingPairingUrl = null
                    showPairingConfirmationDialog = false
                    showPasswordDialog = true
                }) { Text("短码一致，继续") }
            },
            dismissButton = {
                TextButton(onClick = {
                    showPairingConfirmationDialog = false
                    clearConfigImportSource()
                    status = "已取消局域网配对"
                }) { Text("取消") }
            },
        )
    }

    if (showPasswordDialog) {
        AlertDialog(
            onDismissRequest = {
                showPasswordDialog = false
                password = ""
                importError = null
                clearConfigImportSource()
            },
            title = { Text("解密配置") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("输入 macOS 导出时设置的密码。解密成功后会先显示导入摘要，确认后才写入本机。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedTextField(
                        value = password,
                        onValueChange = {
                            password = it
                            importError = null
                        },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("导出密码") },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    )
                    importError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val uri = selectedUri
                    if ((uri == null && pairingUrl == null) || password.isBlank()) {
                        importError = "配置密码不能为空"
                        return@TextButton
                    }
                    scope.launch {
                        try {
                            val raw = when {
                                uri != null -> withContext(Dispatchers.IO) {
                                    context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
                                        ?: throw IllegalArgumentException("无法读取配置文件")
                                }
                                pairingUrl != null -> pairingClient.download(pairingUrl!!)
                                else -> throw IllegalArgumentException("未选择配置来源")
                            }
                            val passwordChars = password.toCharArray()
                            pendingImportedConfig = try {
                                withContext(Dispatchers.Default) {
                                    MiaosConfigImporter.parse(raw, passwordChars)
                                }
                            } finally {
                                passwordChars.fill('\u0000')
                            }
                            showPasswordDialog = false
                            password = ""
                            importError = null
                            clearConfigImportSource()
                            status = "配置已解密，请确认导入内容"
                        } catch (error: Exception) {
                            importError = error.message ?: "配置导入失败"
                        }
                    }
                }) { Text("下一步") }
            },
            dismissButton = {
                TextButton(onClick = {
                    showPasswordDialog = false
                    password = ""
                    importError = null
                    clearConfigImportSource()
                }) { Text("取消") }
            },
        )
    }

    pendingImportedConfig?.let { importedConfig ->
        ConfigImportPreviewDialog(
            config = importedConfig,
            onDismiss = { pendingImportedConfig = null },
            onConfirm = {
                scope.launch {
                    try {
                        repository.importConfig(importedConfig)
                        status = "已导入 ${importedConfig.providers.size} 个供应商配置"
                        pendingImportedConfig = null
                    } catch (error: Exception) {
                        status = error.message ?: "配置导入失败"
                    }
                }
            },
        )
    }

    if (showProviderEditor) {
        ProviderEditorDialog(
            provider = providerForEdit,
            onDismiss = { showProviderEditor = false },
            onSave = { provider, apiKey ->
                scope.launch {
                    try {
                        repository.saveProvider(provider, apiKey)
                        status = "已保存供应商 ${provider.name}"
                        showProviderEditor = false
                    } catch (error: Exception) {
                        status = error.message ?: "保存供应商失败"
                    }
                }
            },
        )
    }

    providerForModelManagement?.let { provider ->
        ProviderModelManagementDialog(
            provider = provider,
            onDismiss = { providerForModelManagement = null },
            onSave = { imageModels, textModels ->
                scope.launch {
                    repository.saveProvider(provider.copy(
                        imageModelsJson = imageModels.toJson(),
                        textModelsJson = textModels.toJson(),
                        updatedAt = System.currentTimeMillis(),
                    ), apiKey = null)
                    status = "已更新 ${provider.name} 的模型启用状态"
                    providerForModelManagement = null
                }
            },
        )
    }

    providerForDelete?.let { provider ->
        AlertDialog(
            onDismissRequest = { providerForDelete = null },
            title = { Text("删除供应商？") },
            text = { Text("将删除“${provider.name}”的本地配置与 Android Keystore 中的 API Key，历史图片不会受影响。") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        repository.deleteProvider(provider.id)
                        status = "已删除供应商 ${provider.name}"
                        providerForDelete = null
                    }
                }) { Text("删除") }
            },
            dismissButton = { TextButton(onClick = { providerForDelete = null }) { Text("取消") } },
        )
    }
}


@Composable
private fun ConfigImportPreviewDialog(
    config: ImportedConfig,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    val preview = remember(config) { configImportPreview(config) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("确认导入配置") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("以下内容将在确认后保存到本机。API Key 仅显示数量，不会在界面中展示。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                MiaosCard(contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp)) {
                    Text("${preview.providerCount} 个供应商 · ${preview.secretCount} 个 API Key", style = MaterialTheme.typography.titleMedium)
                    Text("主题偏好：${preview.themeLabel}", modifier = Modifier.padding(top = 4.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                preview.providers.forEach { provider ->
                    MiaosCard(contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp)) {
                        Text(provider.name, style = MaterialTheme.typography.titleSmall)
                        Text(provider.type, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(
                            "启用图像模型 ${provider.enabledImageModelCount} 个 · 文本模型 ${provider.enabledTextModelCount} 个",
                            modifier = Modifier.padding(top = 4.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onConfirm) { Text("确认导入") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun ProviderEditorDialog(
    provider: ProviderEntity?,
    onDismiss: () -> Unit,
    onSave: (ProviderEntity, String?) -> Unit,
) {
    var name by remember(provider?.id) { mutableStateOf(provider?.name.orEmpty()) }
    var type by remember(provider?.id) { mutableStateOf(provider?.type?.takeIf { it in providerTypes } ?: "openai") }
    var endpoint by remember(provider?.id) { mutableStateOf(provider?.endpoint.orEmpty()) }
    var apiKey by remember(provider?.id) { mutableStateOf("") }
    var modelIds by remember(provider?.id) { mutableStateOf(provider?.imageModelIdsText().orEmpty()) }
    var textModelIds by remember(provider?.id) { mutableStateOf(provider?.textModelIdsText().orEmpty()) }
    var error by remember(provider?.id) { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (provider == null) "新增供应商" else "编辑供应商") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("API Key 为空时会保留已有密钥；它不会在此处回显。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(value = name, onValueChange = { name = it }, modifier = Modifier.fillMaxWidth(), label = { Text("名称") }, singleLine = true)
                Text("类型", style = MaterialTheme.typography.labelLarge)
                providerTypes.forEach { option ->
                    if (type == option) {
                        Button(onClick = { }, modifier = Modifier.fillMaxWidth()) { Text(providerTypeLabel(option)) }
                    } else {
                        OutlinedButton(onClick = { type = option }, modifier = Modifier.fillMaxWidth()) { Text(providerTypeLabel(option)) }
                    }
                }
                OutlinedTextField(value = endpoint, onValueChange = { endpoint = it }, modifier = Modifier.fillMaxWidth(), label = { Text("HTTPS API 端点") }, singleLine = true)
                OutlinedTextField(
                    value = apiKey,
                    onValueChange = { apiKey = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("新的 API Key（可选）") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                )
                OutlinedTextField(value = modelIds, onValueChange = { modelIds = it }, modifier = Modifier.fillMaxWidth(), label = { Text("图像模型 ID（每行一个，可为空）") }, minLines = 3)
                OutlinedTextField(value = textModelIds, onValueChange = { textModelIds = it }, modifier = Modifier.fillMaxWidth(), label = { Text("文本模型 ID（每行一个，可用于提示词优化）") }, minLines = 2)
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                try {
                    require(name.trim().isNotBlank()) { "供应商名称不能为空" }
                    val normalizedEndpoint = validateProviderEndpoint(endpoint)
                    val normalizedModels = modelIds.lines().map(String::trim).filter(String::isNotBlank).distinct()
                    val normalizedTextModels = textModelIds.lines().map(String::trim).filter(String::isNotBlank).distinct()
                    require(hasAnyProviderModel(normalizedModels, normalizedTextModels)) { "至少添加一个图像或文本模型 ID" }
                    onSave(
                        ProviderEntity(
                            id = provider?.id ?: "provider_${UUID.randomUUID()}",
                            name = name.trim(),
                            type = type,
                            endpoint = normalizedEndpoint,
                            capabilitiesJson = JSONArray().apply {
                                if (normalizedModels.isNotEmpty()) put("image")
                                if (normalizedTextModels.isNotEmpty()) put("text")
                            }.toString(),
                            imageModelsJson = normalizedModels.toImageModelsJson(),
                            textModelsJson = normalizedTextModels.toImageModelsJson(),
                            videoModelsJson = provider?.videoModelsJson ?: "[]",
                            updatedAt = System.currentTimeMillis(),
                        ),
                        apiKey.takeIf { it.isNotBlank() },
                    )
                } catch (validation: IllegalArgumentException) {
                    error = validation.message ?: "供应商配置不正确"
                }
            }) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun ProviderModelManagementDialog(
    provider: ProviderEntity,
    onDismiss: () -> Unit,
    onSave: (List<ProviderModelOption>, List<ProviderModelOption>) -> Unit,
) {
    val imageModels = remember(provider.id) { mutableStateListOf(*parseProviderModelOptions(provider.imageModelsJson).toTypedArray()) }
    val textModels = remember(provider.id) { mutableStateListOf(*parseProviderModelOptions(provider.textModelsJson).toTypedArray()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("管理 ${provider.name} 模型") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("关闭的模型不会出现在快速生图、默认模型或提示词优化选择中。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                ModelEnableSection("图像模型", imageModels)
                ModelEnableSection("文本模型", textModels)
            }
        },
        confirmButton = { TextButton(onClick = { onSave(imageModels.toList(), textModels.toList()) }) { Text("保存") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun ModelEnableSection(title: String, models: androidx.compose.runtime.snapshots.SnapshotStateList<ProviderModelOption>) {
    Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 6.dp))
    if (models.isEmpty()) {
        Text("暂无模型，可返回供应商卡片拉取或在编辑页手动添加。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    models.forEachIndexed { index, model ->
        Row(modifier = Modifier.fillMaxWidth()) {
            Checkbox(
                checked = model.enabled,
                onCheckedChange = { enabled -> models[index] = model.copy(enabled = enabled) },
            )
            Column(modifier = Modifier.padding(top = 10.dp)) {
                Text(model.name, style = MaterialTheme.typography.bodyMedium)
                if (model.name != model.id) Text(model.id, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

internal enum class ThemeMode(val value: String, val label: String) {
    LIGHT("light", "浅色"),
    DARK("dark", "深色"),
    SYSTEM("system", "跟随系统"),
}

/** 与 macOS 分段控件保持同一选项顺序，未知保存值安全回退到跟随系统。 */
internal data class ThemeModeSegmentItem(
    val value: String,
    val label: String,
    val isSelected: Boolean,
)

internal fun themeModeSegmentItems(selectedValue: String): List<ThemeModeSegmentItem> {
    val resolvedValue = ThemeMode.entries.firstOrNull { it.value == selectedValue }?.value ?: ThemeMode.SYSTEM.value
    return ThemeMode.entries.map { item ->
        ThemeModeSegmentItem(
            value = item.value,
            label = item.label,
            isSelected = item.value == resolvedValue,
        )
    }
}

/** 不读取设备标识、密钥或网络状态，只在设置页展示可验证的本地边界。 */
internal data class AppInfoSummary(
    val title: String,
    val keyStorage: String,
    val networkBoundary: String,
)

internal fun appInfoSummary(versionName: String): AppInfoSummary {
    val normalizedVersion = versionName.trim().ifBlank { "开发版本" }
    return AppInfoSummary(
        title = "妙生 Android · $normalizedVersion",
        keyStorage = "Android Keystore",
        networkBoundary = "设备直连供应商，不经过妙生服务端",
    )
}

/** macOS 与 Android 共用的局域网配对短码展示文案；仅渲染不可逆确认码。 */
internal data class PairingConfirmationPresentation(
    val title: String,
    val code: String,
    val hint: String,
)

internal fun pairingConfirmationPresentation(code: String): PairingConfirmationPresentation {
    require(code.matches(Regex("(?:[0-9A-F]{6}|------)"))) { "配对确认短码不正确" }
    return PairingConfirmationPresentation(
        title = "配对确认短码",
        code = code,
        hint = "请核对 macOS 配对面板与本机显示的短码。确认一致后，才会读取一次性配对配置并要求输入导出密码。",
    )
}

private val providerTypes = listOf("openai", "grsai", "aiping", "agnes-ai")

private fun providerTypeLabel(type: String): String = when (type) {
    "grsai" -> "Grsai"
    "aiping" -> "Aiping"
    "agnes-ai" -> "Agnes AI"
    else -> "OpenAI 兼容"
}

private fun List<String>.toImageModelsJson(): String = JSONArray().apply {
    forEach { id -> put(JSONObject().put("id", id).put("name", id).put("enabled", true)) }
}.toString()

private fun List<RemoteProviderModel>.toRemoteImageModelsJson(): String = JSONArray().apply {
    forEach { model -> put(JSONObject().put("id", model.id).put("name", model.name).put("enabled", true)) }
}.toString()

private fun ProviderEntity.imageModelIdsText(): String = try {
    val models = JSONArray(imageModelsJson)
    buildList {
        for (index in 0 until models.length()) {
            models.optJSONObject(index)?.optString("id")?.takeIf { it.isNotBlank() }?.let(::add)
        }
    }.joinToString("\n")
} catch (_: Exception) {
    ""
}

private fun ProviderEntity.enabledImageModelCount(): Int = try {
    val models = JSONArray(imageModelsJson)
    (0 until models.length()).count { index -> models.optJSONObject(index)?.optBoolean("enabled", false) == true }
} catch (_: Exception) {
    0
}

private fun ProviderEntity.enabledTextModelCount(): Int = try {
    val models = JSONArray(textModelsJson)
    (0 until models.length()).count { index -> models.optJSONObject(index)?.optBoolean("enabled", false) == true }
} catch (_: Exception) {
    0
}

private fun ProviderEntity.textModelIdsText(): String = try {
    val models = JSONArray(textModelsJson)
    buildList {
        for (index in 0 until models.length()) {
            models.optJSONObject(index)?.optString("id")?.takeIf { it.isNotBlank() }?.let(::add)
        }
    }.joinToString("\n")
} catch (_: Exception) {
    ""
}


private enum class DefaultModelCategory { IMAGE, TEXT }
private enum class ModelCategory { IMAGE, TEXT }

private data class DefaultModelOption(
    val providerId: String,
    val providerName: String,
    val modelId: String,
) {
    val displayName: String get() = "$providerName · $modelId"
}

@Composable
private fun DefaultModelPickerDialog(
    title: String,
    options: List<DefaultModelOption>,
    selectedProviderId: String,
    selectedModelId: String,
    onDismiss: () -> Unit,
    onSelect: (DefaultModelOption) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                options.forEach { option ->
                    if (option.providerId == selectedProviderId && option.modelId == selectedModelId) {
                        Button(onClick = { onSelect(option) }, modifier = Modifier.fillMaxWidth()) { Text(option.displayName) }
                    } else {
                        OutlinedButton(onClick = { onSelect(option) }, modifier = Modifier.fillMaxWidth()) { Text(option.displayName) }
                    }
                }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
        confirmButton = {},
    )
}

private fun List<ProviderEntity>.enabledModelOptions(category: ModelCategory): List<DefaultModelOption> = flatMap { provider ->
    val source = if (category == ModelCategory.IMAGE) provider.imageModelsJson else provider.textModelsJson
    try {
        val models = JSONArray(source)
        buildList {
            for (index in 0 until models.length()) {
                val item = models.optJSONObject(index) ?: continue
                val modelId = item.optString("id")
                if (item.optBoolean("enabled", false) && modelId.isNotBlank()) {
                    add(DefaultModelOption(provider.id, provider.name, modelId))
                }
            }
        }
    } catch (_: Exception) {
        emptyList()
    }
}
