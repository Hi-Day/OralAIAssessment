// Dummy entrypoint to satisfy Vercel's Node.js builder.
// Vercel prioritizes the `public/` directory for static files,
// so this file will only be invoked for unresolved routes (404s).
module.exports = (req, res) => {
  res.statusCode = 404;
  res.end('Not found');
};
