const cors = require('cors');

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, postman, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'https://www.peerverse.in',
      'https://peerverse.in',
      'https://peerverse-final.vercel.app',
      'http://localhost:3000',
      'http://localhost:3001',
      /^https:\/\/.*\.vercel\.app$/ // Allow all Vercel preview URLs
    ];
    
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return origin === allowedOrigin;
      }
      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.error(`CORS Error: Origin ${origin} not allowed`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept', 
    'Authorization',
    'Cache-Control',
    'X-Access-Token'
  ],
  optionsSuccessStatus: 200
};

// Custom CORS middleware
const customCors = (req, res, next) => {
  const origin = req.headers.origin;
  
  // Set CORS headers manually as backup
  if (origin && (
    origin === 'https://www.peerverse.in' ||
    origin === 'https://peerverse.in' ||
    origin === 'https://peerverse-final.vercel.app' ||
    origin.endsWith('.vercel.app')
  )) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
};

module.exports = {
  corsOptions,
  corsMiddleware: cors(corsOptions),
  customCors
};