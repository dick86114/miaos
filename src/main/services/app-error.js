class AppError extends Error {
  constructor(code, userMessage, options = {}) {
    super(userMessage, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}

function toPublicError(error) {
  if (error instanceof AppError) {
    return {
      code: error.code,
      error: error.userMessage,
      retryable: error.retryable,
    };
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
