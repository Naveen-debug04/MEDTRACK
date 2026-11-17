function notFound(_req, _res, next) {
  const error = new Error('The requested resource was not found');
  error.status = 404;
  next(error);
}

function errorHandler(error, _req, res, _next) {
  if (error.name === 'ZodError') {
    return res.status(400).json({ error: error.issues.map((issue) => issue.message).join('; ') });
  }
  if (error.code === 11000) {
    if (error.keyPattern?.email) return res.status(409).json({ error: 'An account with that email already exists' });
    return res.status(409).json({ error: 'A record with that email, barcode, or batch number already exists' });
  }
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({ error: 'Please check the submitted information' });
  }
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({
    error: status >= 500 ? 'Something went wrong. Please try again' : error.message
  });
}

module.exports = { errorHandler, notFound };
