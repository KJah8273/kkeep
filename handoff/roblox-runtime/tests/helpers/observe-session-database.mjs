// Observe the real provider's IndexedDB connections, including direct atomic
// transactions. Do not substitute a second in-memory token for the database.
export function observeSessionDatabase(openDb, writes) {
  const observedStores = new WeakSet();
  return async (...args) => {
    const database = await openDb(...args);
    const transaction = database.transaction.bind(database);
    database.transaction = (...args) => {
      const tx = transaction(...args);
      const objectStore = tx.objectStore.bind(tx);
      tx.objectStore = (...args) => {
        const store = objectStore(...args);
        if (!observedStores.has(store)) {
          observedStores.add(store);
          for (const [method, operation] of [['put', 'put'], ['delete', 'del']]) {
            const original = store[method].bind(store);
            store[method] = (...args) => {
              if (args[method === 'put' ? 1 : 0] === 'token') writes.push(operation);
              return original(...args);
            };
          }
        }
        return store;
      };
      return tx;
    };
    return database;
  };
}
