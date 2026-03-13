function normalizeUrl(url?: string | null) {
  if (!url) {
    return null;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\/+$/, '');
}

export function getPublicAppUrl() {
  const configuredUrl = normalizeUrl(process.env.NEXT_PUBLIC_SITE_URL);
  if (configuredUrl) {
    return configuredUrl;
  }

  if (typeof window !== 'undefined') {
    return normalizeUrl(window.location.origin);
  }

  return null;
}
