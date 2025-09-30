# PeerVerse Deployment Guide

## Quick Fix for Current Issues

### 1. Environment Variables Setup
In your Vercel dashboard, add these environment variables:

```
DATABASE_URL = postgresql://neondb_owner:npg_hqp6LX2UWlVA@ep-young-sound-adq39fqe-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
JWT_SECRET = a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6A7B8C9D0E1F2G3H4I5J6K7L8M9N0
MAILJET_API_KEY = 2ab8bdb99980ef4e41140d4587a0495c
MAILJET_SECRET_KEY = 2d26f17122aeb9dce852beae28da4a66
MAILJET_SENDER_EMAIL = ninadkhopade16@gmail.com
NODE_ENV = production
```

### 2. Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy from project root
vercel --prod
```

### 3. Test the Deployment

After deployment:
1. Visit your Vercel URL
2. Try to sign up/login
3. Check if OTP emails are being sent

## What Was Fixed

1. **API URL Configuration**: Changed from Railway URL to dynamic `window.location.origin`
2. **Email Error Handling**: Added better error logging for Mailjet issues
3. **Vercel Configuration**: Created proper `vercel.json` for full-stack deployment
4. **Environment Variables**: Structured proper env var setup

## Troubleshooting

If you still get errors:

1. **500 Error on Login**: Check Vercel function logs for database connection issues
2. **OTP Email Fails**: Verify Mailjet credentials in Vercel dashboard
3. **CORS Issues**: The API now uses `origin: true` which should handle cross-origin requests

## Next Steps

1. Deploy using the commands above
2. Test all functionality
3. Monitor Vercel function logs for any remaining issues