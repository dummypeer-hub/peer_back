const config = {
  API_BASE_URL: process.env.NODE_ENV === 'production' 
    ? 'https://peerversefinal-production.up.railway.app/api'
    : 'http://localhost:5000/api',
  SOCKET_URL: process.env.NODE_ENV === 'production'
    ? 'https://peerversefinal-production.up.railway.app'
    : 'http://localhost:5000'
};

export default config;
