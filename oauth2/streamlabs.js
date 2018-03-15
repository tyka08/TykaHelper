module.exports = function streamlabs(container) {
  /* REQUIREMENTS ==============================================================
  ============================================================================*/
  const oauth2     = require('simple-oauth2');
  const request    = require('request');
  const chalk      = require('chalk');

  const module = {};

  /* CONFIGURATION =============================================================
  ============================================================================*/
  module.token = null; // will be popupated by module

  module.config = container.config.oauth2.streamlabs;
  module.redirectURI = `${container.fn.getHostName()}:${container.config.port}/oauth2/streamlabs`;
  module.credentials = {
    client: {
      id: module.config.client_id,
      secret: module.config.client_secret
    },
    auth: {
      tokenHost: 'https://www.streamlabs.com',
      tokenPath: '/api/v1.0/token',
      authorizePath: '/api/v1.0/authorize'
    },
    options: {
      bodyFormat: 'json'
    }
  };

  /* OAUTH2 CLIENT =============================================================
  ============================================================================*/
  module.client = oauth2.create(module.credentials);
  module.authURI = module.client.authorizationCode.authorizeURL({
    redirect_uri: module.redirectURI,
    scope: 'donations.read'
  });

  /* WEB INTERFACE =============================================================
  ============================================================================*/
  container.web.get('/oauth2/streamlabs/go', (req, res) => {
    res.redirect(module.authURI);
  });
  container.web.get('/oauth2/streamlabs', (req, res) => {
    const code = req.query.code;
    const options = {
      code: code,
      redirect_uri: module.redirectURI
    };

    // get the token
    module.client.authorizationCode.getToken(options)
    .then((result) => {
      module.token = module.client.accessToken.create(result);
      container.storage.update(
        {type: 'token-streamlabs'},
        {type: 'token-streamlabs', value: module.token},
        {upsert: true},
        (error, numReplaced) => {
          if (error) {
            console.log(error);
          }
          return res.status(200).json('Connected successfully!');
      });
    })
    .catch((error) => {
      console.log('Streamlabs: Access Token Error', error.message);
      return res.status(500).json(error.message);
    });
  });

  /* METHODS ===================================================================
  ============================================================================*/
  module.getToken = (callback) => {

  };

  module.refreshToken = (callback) => {

  };

  module.withToken = (callback) => {
    /* pass through that allows module methods to ensure they have an up to date
       token with each request
    */

    if (!module.token) {
      // fetch the token from the database
      container.storage.findOne({type: 'token-streamlabs'}, (error, result) => {
        if (result) {
          module.token = result.value.token;
          if (callback) {
            callback();
          }
        } else {
          console.log(`Streamlabs Connection: ${chalk.red('[ERROR]: No Token Found.')}\n - Please visit ${chalk.red(`${module.redirectURI}/go`)} to authorize a token.`);
        }
      });
    } else if (callback) {
      callback();
    }
  };

  module.fetchDonations = (callback) => {
    module.withToken(() => {
      request({
        url: 'https://www.streamlabs.com/api/v1.0/donations',
        qs: {
          access_token: module.token.access_token,
          limit: 100,
          verified: true
        }
      }, (error, response, body) => {
        if (callback) {
          callback(error, response, body);
        }
      });
    });
  };

  return module;
};
