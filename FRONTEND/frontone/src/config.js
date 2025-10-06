const config = {
  API_BASE_URL: process.env.NODE_ENV === 'production' 
    ? 'https://peerversefinal-production.up.railway.app/api'
    : 'http://localhost:3000/api',
  SOCKET_URL: process.env.NODE_ENV === 'production'
    ? 'https://peerversefinal-production.up.railway.app'
    : 'http://localhost:3000',
  // Network timeout settings
  TIMEOUT: 15000, // 15 seconds
  RETRY_ATTEMPTS: 3
};

// Add request interceptor for better error handling
export const createApiRequest = async (url, options = {}) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.TIMEOUT);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('API Request failed:', error);
    throw error;
  }
};

export default config;
