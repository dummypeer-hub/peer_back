-- Payments table for Razorpay integration
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    mentor_id INTEGER NOT NULL,
    
    razorpay_order_id VARCHAR(255) UNIQUE,
    razorpay_payment_id VARCHAR(255) UNIQUE,
    razorpay_signature VARCHAR(500),
    
    amount DECIMAL(10,2) NOT NULL,
    mentor_amount DECIMAL(10,2) NOT NULL,
    platform_fee DECIMAL(10,2) NOT NULL,
    
    currency VARCHAR(3) DEFAULT 'INR',
    status VARCHAR(20) DEFAULT 'created',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP,
    failed_at TIMESTAMP,
    
    payment_response JSONB,
    
    FOREIGN KEY (booking_id) REFERENCES bookings(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (mentor_id) REFERENCES users(id)
);

-- Add payment columns to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS session_fee DECIMAL(10,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS call_allowed BOOLEAN DEFAULT FALSE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP;

-- Mentor payment details
CREATE TABLE IF NOT EXISTS mentor_payment_details (
    id SERIAL PRIMARY KEY,
    mentor_id INTEGER UNIQUE NOT NULL,
    upi_id VARCHAR(100),
    bank_account_number VARCHAR(50),
    ifsc_code VARCHAR(15),
    account_holder_name VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (mentor_id) REFERENCES users(id)
);

-- Payment webhooks log
CREATE TABLE IF NOT EXISTS payment_webhooks (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50),
    razorpay_payment_id VARCHAR(255),
    razorpay_order_id VARCHAR(255),
    
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);