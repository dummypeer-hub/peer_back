const config = {
  API_BASE_URL: process.env.NODE_ENV === 'production' 
    ? 'https://peerversefinal-production.up.railway.app/api'
    : 'https://peerversefinal-production.up.railway.app/api',
  SOCKET_URL: process.env.NODE_ENV === 'production'
    ? 'https://peerversefinal-production.up.railway.app'
    : 'https://peerversefinal-production.up.railway.app'
};

export default config;
