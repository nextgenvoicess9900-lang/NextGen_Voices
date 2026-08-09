/** Central error handler — never leaks stack traces in production. */
function errorHandler(err, req, res, next) {
  console.error('[error]', err);
  const status = err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';
  res.status(status).json({
    error: isProd ? 'Something went wrong.' : err.message,
    ...(isProd ? {} : { stack: err.stack }),
  });
}

function notFound(req, res) {
  res.status(404).json({ error: 'Route not found.' });
}

module.exports = { errorHandler, notFound };
