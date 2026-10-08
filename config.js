// Paste your Apps Script Web app URL here after deploying (or leave blank and enter it on the login screen once).
const localApiOverride = ['localhost', '127.0.0.1'].includes(location.hostname)
  ? new URLSearchParams(location.search).get('api')
  : '';

window.CV_CONFIG = {
  API_URL:
    localApiOverride ||
    'https://script.google.com/macros/s/AKfycbys21L1jrEYXmdjN5lf1dYlAQJnqGRU3WjGQrvpPwjW7_zVJNb7w6ExRDnmbrkkFdM/exec',
};
