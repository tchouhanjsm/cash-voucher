// Local development can explicitly opt into the same-origin Laravel shadow API.
// Customer builds generate an Apps Script-only config; this switch is not deployed.
const localDevHost = ['localhost', '127.0.0.1'].includes(location.hostname);
const localParams = new URLSearchParams(location.search);
const localApiOverride = localDevHost ? localParams.get('api') : '';
const localLaravelShadow = localDevHost && localParams.get('transport') === 'laravel-shadow';

window.CV_CONFIG = {
  API_URL: localLaravelShadow ? '' : localApiOverride || '',
  API_TRANSPORT: localLaravelShadow ? 'laravel-cookie-shadow' : 'apps-script',
  LARAVEL_API_URL: localLaravelShadow ? new URL('/api/v1', location.origin).href : '',
  ENVIRONMENT: localApiOverride ? 'staging' : '',
  DEPLOYMENT_ID: localApiOverride ? 'MOCK_DEPLOYMENT' : '',
};
