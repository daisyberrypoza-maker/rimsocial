module.exports = (status, message) => Object.assign(new Error(message), { status, expose: true });
