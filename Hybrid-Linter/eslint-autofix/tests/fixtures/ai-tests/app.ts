// app.ts
import { initializeApp } from './configUtils';

function startApp() {
  // The 'options' parameter is flagged as unused because it doesn't match
  // the parameter name in the imported function anymore
  const options = {
    debug: true,
    logLevel: 'info'
  };

  // Should be passing 'options' as 'config'
  const app = initializeApp({
    debug: false,
    logLevel: 'error'
  });

  return app;
}