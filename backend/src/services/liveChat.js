// Live chat notifications over Redis pub/sub. Each user has a channel; an open stream subscribes to it.
// Only a small "something changed" event is sent, the message itself is loaded through the normal API.
const redis = require('../redis');

const subscriber = redis.duplicate();
const listeners = new Map(); // userId -> Set of open responses
const PREFIX = 'chat:';

subscriber.on('message', (channel, raw) => {
  const set = listeners.get(channel.slice(PREFIX.length));
  if (!set) return;
  for (const res of set) res.write(`data: ${raw}\n\n`);
});

async function publish(userIds, event) {
  const payload = JSON.stringify(event);
  const unique = [...new Set(userIds.map(String))];
  await Promise.all(unique.map((id) => redis.publish(PREFIX + id, payload).catch(() => {})));
}

// Returns a function that stops listening for this response
function listen(userId, res) {
  const id = String(userId);
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
    subscriber.subscribe(PREFIX + id).catch(() => {});
  }
  set.add(res);
  return () => {
    set.delete(res);
    if (!set.size && listeners.get(id) === set) {
      listeners.delete(id);
      subscriber.unsubscribe(PREFIX + id).catch(() => {});
    }
  };
}

module.exports = { publish, listen };
