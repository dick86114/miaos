class AppError extends Error {
  constructor(code, userMessage, options = {}) {
    super(userMessage, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
    this.diagnosticId = typeof options.diagnosticId === 'string' ? options.diagnosticId : null;
    this.stage = typeof options.stage === 'string' ? options.stage : null;
    this.reasonCode = typeof options.reasonCode === 'string' ? options.reasonCode : null;
  }
}

function toPublicError(error) {
  if (error instanceof AppError) {
    const result = {
      code: error.code,
      error: error.userMessage,
      retryable: error.retryable,
    };
    if (error.diagnosticId) result.diagnosticId = error.diagnosticId;
    if (error.stage) result.stage = error.stage;
    if (error.reasonCode) result.reasonCode = error.reasonCode;
    return result;
  }

  return {
    code: 'INTERNAL_ERROR',
    error: '请求处理失败，请稍后重试',
    retryable: false,
  };
}

module.exports = {
  AppError,
  toPublicError,
};
