/**
 * Browser stub for @react-native-async-storage/async-storage
 * (optional peer of @metamask/sdk — not needed in web, but must resolve).
 */
function store() {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  const mem = new Map();
  return {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => {
      mem.set(k, String(v));
    },
    removeItem: k => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
  };
}

const AsyncStorage = {
  getItem: async key => store().getItem(key),
  setItem: async (key, value) => {
    store().setItem(key, value);
  },
  removeItem: async key => {
    store().removeItem(key);
  },
  clear: async () => {
    store().clear();
  },
  getAllKeys: async () => [],
  multiGet: async keys => Promise.all(keys.map(async k => [k, await AsyncStorage.getItem(k)])),
  multiSet: async pairs => {
    for (const [k, v] of pairs) await AsyncStorage.setItem(k, v);
  },
  multiRemove: async keys => {
    for (const k of keys) await AsyncStorage.removeItem(k);
  },
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
