/**
 * Shared in-memory session store.
 *
 * A single Map instance shared between the chat server (server.js) and the admin
 * routes (routes/admin.js). It was a local `const sessions = new Map()` in
 * server.js; promoting it to a module lets the live-takeover endpoints invalidate
 * a session (`sessions.delete(id)`) so that when the AI resumes it rebuilds its
 * message history from the database (which includes the operator's turns) instead
 * of a stale in-memory copy.
 *
 * Same Map API as before, so every existing `.get/.set/.has/.delete/.entries`
 * call keeps working unchanged.
 */
module.exports = new Map();
