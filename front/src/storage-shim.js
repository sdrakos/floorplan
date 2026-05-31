// Polyfill the Claude-artifact `window.storage` API using localStorage,
// so the components run in a plain browser. get() returns { value } (a JSON
// string) or null — matching what the components expect.
if (!window.storage) {
  window.storage = {
    async get(key) {
      const value = localStorage.getItem(key);
      return value == null ? null : { value };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
      return true;
    },
    async delete(key) {
      localStorage.removeItem(key);
      return true;
    },
  };
}
