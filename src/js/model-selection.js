// 模型选项必须同时匹配供应商与模型 ID，避免不同供应商的同名模型被同时选中。
export function isModelOptionSelected(optionProviderId, optionModelId, selectedProviderId, selectedModelId) {
  return Boolean(optionProviderId)
    && Boolean(optionModelId)
    && optionProviderId === selectedProviderId
    && optionModelId === selectedModelId;
}
