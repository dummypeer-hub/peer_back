import config from '../config';

export const createBooking = async (menteeId, mentorId, sessionFee, scheduledTime) => {
  try {
    const response = await fetch(`${config.API_BASE_URL}/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menteeId,
        mentorId,
        sessionFee,
        scheduledTime
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create booking');
    }

    return await response.json();
  } catch (error) {
    console.error('Create booking error:', error);
    throw error;
  }
};

export const checkCallAccess = async (bookingId) => {
  try {
    const response = await fetch(`${config.API_BASE_URL}/bookings/${bookingId}/payment-status`);
    if (response.ok) {
      const data = await response.json();
      return data.callAllowed;
    }
    return false;
  } catch (error) {
    console.error('Check call access error:', error);
    return false;
  }
};

export const saveMentorPaymentDetails = async (mentorId, paymentDetails) => {
  try {
    const response = await fetch(`${config.API_BASE_URL}/mentors/payment-details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mentorId,
        ...paymentDetails
      })
    });

    if (!response.ok) {
      throw new Error('Failed to save payment details');
    }

    return await response.json();
  } catch (error) {
    console.error('Save payment details error:', error);
    throw error;
  }
};

export const calculateFees = (amount) => {
  const mentorAmount = Math.round(amount * 0.70 * 100) / 100;
  const platformFee = Math.round(amount * 0.30 * 100) / 100;
  const gatewayFee = Math.round(amount * 0.0236 * 100) / 100; // ~2.36% (2% + GST)
  
  return {
    total: amount,
    mentorAmount,
    platformFee,
    gatewayFee,
    netPlatformRevenue: Math.round((platformFee - gatewayFee) * 100) / 100
  };
};