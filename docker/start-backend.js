process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const app = require('../server/index');

const PORT = process.env.PORT || 4000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Orbit API running on port ${PORT}`);
});
