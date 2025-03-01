// configUtils.ts
export function initializeApp(config: any) {
  // This function previously accepted 'options' but was renamed to 'config'
  console.log('Initializing app with config:', config);
  return {
    isInitialized: true,
    config
  };
}