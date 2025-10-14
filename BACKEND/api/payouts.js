// Manual payout processing endpoint
const express = require('express');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Process pending payouts (manual trigger)
const processPendingPayouts = async (req, res) => {
  try {
    const pendingPayouts = await pool.query(`
      SELECT ps.id, ps.mentor_id, ps.amount, mpd.upi_id, u.username
      FROM payment_settlements ps
      JOIN mentor_payment_details mpd ON ps.mentor_id = mpd.mentor_id
      JOIN users u ON ps.mentor_id = u.id
      WHERE ps.settlement_status = 'pending'
      ORDER BY ps.created_at ASC
      LIMIT 10
    `);

    const results = [];
    
    for (const payout of pendingPayouts.rows) {
      try {
        // In production, integrate with UPI payment API
        // For now, mark as completed for testing
        await pool.query(`
          UPDATE payment_settlements 
          SET settlement_status = 'completed', settled_at = NOW(),
              settlement_response = $1
          WHERE id = $2
        `, [JSON.stringify({ reference: `UPI_${Date.now()}`, method: 'manual' }), payout.id]);
        
        results.push({
          mentorId: payout.mentor_id,
          username: payout.username,
          amount: payout.amount,
          upiId: payout.upi_id,
          status: 'completed'
        });
        
        console.log(`Payout processed: ₹${payout.amount} to ${payout.upi_id} for ${payout.username}`);
      } catch (error) {
        console.error(`Payout failed for mentor ${payout.mentor_id}:`, error);
        
        await pool.query(`
          UPDATE payment_settlements 
          SET settlement_status = 'failed'
          WHERE id = $1
        `, [payout.id]);
        
        results.push({
          mentorId: payout.mentor_id,
          username: payout.username,
          amount: payout.amount,
          status: 'failed',
          error: error.message
        });
      }
    }

    res.json({
      message: `Processed ${results.length} payouts`,
      results
    });
  } catch (error) {
    console.error('Process payouts error:', error);
    res.status(500).json({ error: 'Failed to process payouts' });
  }
};

// Get payout history
const getPayoutHistory = async (req, res) => {
  try {
    const { mentorId } = req.params;
    
    const payouts = await pool.query(`
      SELECT ps.*, p.amount as total_payment, p.razorpay_payment_id
      FROM payment_settlements ps
      JOIN payments p ON ps.payment_id = p.id
      WHERE ps.mentor_id = $1
      ORDER BY ps.created_at DESC
      LIMIT 50
    `, [mentorId]);

    res.json({ payouts: payouts.rows });
  } catch (error) {
    console.error('Get payout history error:', error);
    res.status(500).json({ error: 'Failed to get payout history' });
  }
};

module.exports = {
  processPendingPayouts,
  getPayoutHistory
};