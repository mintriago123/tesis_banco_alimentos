/** @type {import('next').NextConfig} */
const isProduction = process.env.NODE_ENV === 'production';

const toOrigin = (value?: string) => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const toWebSocketOrigin = (value?: string) => {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const protocol = url.protocol === 'https:'
      ? 'wss:'
      : url.protocol === 'http:'
        ? 'ws:'
        : null;

    return protocol ? `${protocol}//${url.host}` : null;
  } catch {
    return null;
  }
};

const uniqueSources = (sources: Array<string | null | undefined>) =>
  Array.from(new Set(sources.filter((source): source is string => Boolean(source))));

const buildContentSecurityPolicy = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseOrigin = toOrigin(supabaseUrl);
  const supabaseWebSocketOrigin = toWebSocketOrigin(supabaseUrl);

  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    ['base-uri', ["'self'"]],
    ['object-src', ["'none'"]],
    ['frame-ancestors', ["'none'"]],
    ['form-action', ["'self'"]],
    ['script-src', uniqueSources([
      "'self'",
      "'unsafe-inline'",
      isProduction ? null : "'unsafe-eval'",
      'https://api.mapbox.com',
      'https://maps.googleapis.com',
    ])],
    ['style-src', [
      "'self'",
      "'unsafe-inline'",
      'https://api.mapbox.com',
      'https://fonts.googleapis.com',
    ]],
    ['img-src', [
      "'self'",
      'data:',
      'blob:',
      'https://api.mapbox.com',
      'https://*.mapbox.com',
      'https://*.tiles.mapbox.com',
      'https://maps.gstatic.com',
      'https://*.googleapis.com',
      'https://*.ggpht.com',
    ]],
    ['font-src', [
      "'self'",
      'data:',
      'https://fonts.gstatic.com',
    ]],
    ['connect-src', uniqueSources([
      "'self'",
      supabaseOrigin,
      supabaseWebSocketOrigin,
      'https://*.supabase.co',
      'wss://*.supabase.co',
      'https://api.mapbox.com',
      'https://events.mapbox.com',
    ])],
    ['frame-src', [
      "'self'",
      'https://www.google.com',
      'https://www.google.com.ec',
      'https://maps.google.com',
    ]],
    ['worker-src', ["'self'", 'blob:']],
    ['manifest-src', ["'self'"]],
  ];

  if (isProduction) {
    directives.push(['upgrade-insecure-requests', []]);
  }

  return directives
    .map(([directive, sources]) => `${directive}${sources.length > 0 ? ` ${sources.join(' ')}` : ''}`)
    .join('; ');
};

const nextConfig = {
  // Suprimir console.log SOLO en producción (mantener en desarrollo)
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn']
    } : false
  },

  // Permite recursos de desarrollo (HMR) desde la IP de la red local.
  allowedDevOrigins: ['192.168.100.8'],

  async headers() {
    const securityHeaders = [
      {
        key: 'Content-Security-Policy',
        value: buildContentSecurityPolicy(),
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(self)',
      },
    ];

    if (isProduction) {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      });
    }

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  
  reactStrictMode: true,
};

module.exports = nextConfig;
