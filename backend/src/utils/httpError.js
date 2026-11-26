// Error with an HTTP status. Optional extra fields (for example a machine-readable code) are kept on the error.
module.exports = (status, message, extra = {}) => Object.assign(new Error(message), { status, expose: true }, extra);
