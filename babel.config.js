module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // `inline-dotenv` se quitó: Expo ya carga .env y expone EXPO_PUBLIC_* (el
    // build imprime "env: load .env / env: export EXPO_PUBLIC_..."), y el plugin
    // dejaba referencias sueltas a `process` en el bundle -> en el navegador
    // "Uncaught ReferenceError: process is not defined" y la pantalla en blanco.
  };
};
