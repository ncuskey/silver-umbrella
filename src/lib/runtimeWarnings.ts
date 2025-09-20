let warned = false;

export function warnIfInvalidAssetPrefix() {
  if (warned) return;
  const prefix = process.env.ASSET_PREFIX || '';
  if (!prefix) return;

  const isProd = process.env.NODE_ENV === 'production';
  const isAbsolute = /^https?:\/\//i.test(prefix);
  if (!isProd && isAbsolute) {
    warned = true;
    console.warn('[assetPrefix] Absolute asset prefix detected in non-production environment:', prefix);
  }
}
