module.exports = function twitch(web, config) {

  const module = {};

  module.setup = () => {
    console.log(config);
  };

  return module;
};
