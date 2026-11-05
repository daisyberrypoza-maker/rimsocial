const Redis = require('ioredis');
const config = require('./config');

module.exports = new Redis(config.redisUrl, { maxRetriesPerRequest: 2 });
