const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function createProviderIdError() {
  const error = new Error('供应商 ID 格式不正确');
  error.code = 'SECRET_PROVIDER_ID_INVALID';
  return error;
}

function assertProviderId(providerId) {
  if (typeof providerId !== 'string' || !PROVIDER_ID_PATTERN.test(providerId)
    || providerId === '__proto__' || providerId === 'constructor') {
    throw createProviderIdError();
  }
  return providerId;
}

module.exports = {
  PROVIDER_ID_PATTERN,
  assertProviderId,
};
