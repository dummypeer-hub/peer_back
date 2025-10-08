const Joi = require('joi');

// Schemas
const sessionFeedbackSchema = Joi.object({
  sessionId: Joi.number().integer().required(),
  menteeId: Joi.number().integer().required(),
  mentorId: Joi.number().integer().optional(),
  rating: Joi.number().integer().min(1).max(5).required(),
  feedback: Joi.string().allow('').max(2000).optional()
});

const blogViewSchema = Joi.object({
  userId: Joi.number().integer().optional()
});

const mentorUpiSchema = Joi.object({
  upi_id: Joi.string().trim().pattern(/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/).required(),
  holder_name: Joi.string().allow('', null).max(255).optional()
});

// Middleware factory
function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      const details = error.details.map(d => d.message).join('; ');
      console.warn('Validation failed:', details);
      return res.status(400).json({ error: 'Invalid request body', details });
    }
    req.body = value; // replace with validated/cleaned value
    next();
  };
}

module.exports = {
  validateBody,
  schemas: {
    sessionFeedbackSchema,
    blogViewSchema,
    mentorUpiSchema
  }
};
