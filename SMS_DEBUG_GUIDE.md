# SMS OTP Debugging Guide

## Current Authentication Flow

### Login Process (3 Steps):
1. **Email/Password Verification**: User enters email, password, and role
2. **Phone Input**: User enters phone number for SMS verification
3. **SMS OTP Verification**: User enters 6-digit OTP received via SMS

### Signup Process (4 Steps):
1. **Role Selection**: User selects mentor or mentee
2. **User Details**: User enters username, email, phone, password
3. **SMS OTP Verification**: User enters 6-digit OTP received via SMS
4. **Account Creation**: Account is created after OTP verification

## Firebase Configuration

### Project Details:
- **Project ID**: peerverse-c2dbb
- **Auth Domain**: peerverse-c2dbb.firebaseapp.com
- **API Key**: AIzaSyBI8Tw8MXTW5WrBlDTQ5ESI5qdsYSYuPtY

### Required Firebase Settings:
1. **Authentication** → **Sign-in method** → **Phone** should be enabled
2. **Authentication** → **Settings** → **Authorized domains** should include:
   - localhost
   - peerverse-final.vercel.app
   - peerverse.in
   - www.peerverse.in

## Common Issues and Solutions

### 1. reCAPTCHA Issues
**Symptoms**: "Captcha verification failed" or reCAPTCHA not loading
**Solutions**:
- Ensure Firebase project has Phone authentication enabled
- Check if domain is authorized in Firebase console
- Verify reCAPTCHA site key is correct
- Try using visible reCAPTCHA instead of invisible for testing

### 2. Phone Number Format Issues
**Symptoms**: "Invalid phone number format"
**Solutions**:
- Always use international format: +91xxxxxxxxxx
- Remove any spaces, dashes, or special characters
- Ensure 10 digits after +91

### 3. Firebase Quota Issues
**Symptoms**: "Too many requests" or quota exceeded
**Solutions**:
- Check Firebase console for usage limits
- Implement rate limiting on frontend
- Use test phone numbers for development

### 4. Network/CORS Issues
**Symptoms**: Network errors or blocked requests
**Solutions**:
- Check browser console for CORS errors
- Verify Firebase configuration
- Ensure proper domain authorization

## Testing Steps

### 1. Use SMS Test Component
```javascript
// Import and use SMSTest component for isolated testing
import SMSTest from './components/SMSTest';
```

### 2. Check Browser Console
Look for these logs:
- "Firebase app initialized: true"
- "Firebase auth initialized: true"
- "reCAPTCHA verifier initialized successfully"
- "Attempting to send OTP to: +91xxxxxxxxxx"
- "OTP sent successfully"

### 3. Verify Firebase Console
1. Go to Firebase Console → Authentication → Users
2. Check if phone verification attempts are logged
3. Monitor usage quotas

### 4. Test with Known Working Numbers
Use Firebase test phone numbers for development:
- +1 650-555-3434 (OTP: 654321)
- Add test numbers in Firebase Console → Authentication → Settings

## Environment Variables Check

### Backend (.env):
```
MAILJET_API_KEY=2ab8bdb99980ef4e41140d4587a0495c
MAILJET_SECRET_KEY=2d26f17122aeb9dce852beae28da4a66
MAILJET_SENDER_EMAIL=ninadkhopade16@gmail.com
DATABASE_URL=postgresql://...
JWT_SECRET=...
```

### Frontend (Firebase config):
- All Firebase config values are present
- Project ID matches Firebase console

## Debugging Commands

### 1. Check Firebase Status
```javascript
console.log('Firebase app:', firebase.app());
console.log('Auth instance:', firebase.auth());
```

### 2. Test reCAPTCHA
```javascript
window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container');
```

### 3. Manual OTP Send
```javascript
firebase.auth().signInWithPhoneNumber('+919876543210', window.recaptchaVerifier)
  .then(confirmationResult => {
    console.log('OTP sent:', confirmationResult);
  })
  .catch(error => {
    console.error('Error:', error);
  });
```

## Next Steps if Issues Persist

1. **Check Firebase Console Logs**: Look for authentication errors
2. **Test with Different Phone Numbers**: Try multiple valid Indian numbers
3. **Verify Firebase Project Settings**: Ensure all configurations are correct
4. **Check Network Tab**: Look for failed API calls
5. **Test in Incognito Mode**: Rule out browser cache issues
6. **Try Different Browsers**: Test cross-browser compatibility

## Success Indicators

✅ reCAPTCHA loads without errors
✅ Phone number validation passes
✅ OTP is sent (check phone)
✅ OTP verification succeeds
✅ User is redirected to dashboard
✅ JWT token is stored in localStorage