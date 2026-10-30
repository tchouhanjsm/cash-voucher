// Staging builds inject the validated API URL; local development may use ?api=... or login entry.
const localApiOverride = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? new URLSearchParams(location.search).get('api')
  : '';

window.CV_CONFIG = {
  API_URL: localApiOverride || '',
  ENVIRONMENT: localApiOverride ? 'staging' : '',
  DEPLOYMENT_ID: localApiOverride ? 'MOCK_DEPLOYMENT' : '',
};
