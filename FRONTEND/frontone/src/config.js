const config = {
  API_BASE_URL: process.env.NODE_ENV === 'production' 
    ? 'https://peerversefinal-production.up.railway.app/api'
    : 'http://localhost:3000/api'
};

export default config;