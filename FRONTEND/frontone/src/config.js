const config = {
  API_BASE_URL: process.env.NODE_ENV === 'production' 
    ? 'https://peerversefinal-production.up.railway.app/api'
    : 'https://peerversefinal-production.up.railway.app/api'
};

export default config;
