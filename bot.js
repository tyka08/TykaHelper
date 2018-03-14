/*
    Discord StreamBot

    Author:  Frosthaven
    Twitter: @thefrosthaven

    Description:
        This bot provides useful tools for streamers by bridging the gap between
        discord, twitch, and streamlabs
*/

(() => {
  /* REQUIREMENTS ==============================================================
  ============================================================================*/
  const path       = require('path');

  const discordio  = require('discord.io');
  const express    = require('express');
  const socketio   = require('socket.io');
  const chalk      = require('chalk');
  const Datastore  = require('nedb');

  const container = {};
  container.config = require('./config.json');

  /* NEDB SETUP ================================================================
  ============================================================================*/
  container.storage = new Datastore({
    filename: './storage.nedb',
    autoload: true
  });

  /* DISCORD BOT SETUP =========================================================
  ============================================================================*/
  container.discord = new discordio.Client({
    token:   container.config.bot_token,
    autorun: true
  });

  /* EXPRESS SERVER SETUP ======================================================
  ============================================================================*/
  container.web = express();
  container.sio = null; // will be populated on discord ready event

  // static directory
  container.web.use(express.static(path.join(__dirname, '/web')));

  // default routes
  container.web.get('/new_member_alerts', (req, res) => {
    res.render(`${__dirname}/views/new_member_alerts.twig`, {
      config: container.config
    });
  });
  container.web.get('/voice_chat_monitor', (req, res) => {
    res.render(`${__dirname}/views/voice_chat_monitor.twig`, {
      config: container.config
    });
  });

  /* HELPER LIBRARY ============================================================
  ============================================================================*/
  container.fn = require('./fn')(container);

  /* OAUTH2 SERVICES ===========================================================
  ============================================================================*/
  if (container.config.oauth2 && container.config.oauth2.streamlabs) {
    container.streamlabs = new (require('./oauth2/streamlabs'))(container);
    container.fn.scheduler('fetch-donations', 5000, () => {
      container.streamlabs.fetchDonations((error, response, body) => {
        if (error) {
          console.log(error);
        }
      });
    });
  }

  /* AUTO VOICE RECONNECT ======================================================
  ============================================================================*/
  container.discord.on('any', (event) => {
    if (
      event.t === 'VOICE_STATE_UPDATE'
      && event.d.user_id === container.discord.id
      && !event.d.channel_id
      && container.discord._vChannels
    ) {
      /* bot was disconnected from a voice channel on the server, lets try and
         look for a ghost channel left behind in discord.io
      */
      const serverID = event.d.guild_id;

      Object.keys(container.discord._vChannels).forEach((channelID) => {
        if (container.discord._vChannels[channelID].serverID === serverID) {
          // we found the matching ghost channel for this server
          container.discord.leaveVoiceChannel(channelID, function() {
            setTimeout(() => {
              container.discord.joinVoiceChannel(channelID);
            }, 3000);
          });
        }
      });
    }
  });

  /* ONREADY ===================================================================
  ============================================================================*/
  container.discord.on('ready', (event) => {
    // ensure the bot is on our server, and that we aren't already running
    if (typeof container.discord === 'undefined') {
      setTimeout(() => {
        console.log(`${chalk.red('[Error]: Bot could not be authenticated. Check your authentication and try again')}`);
        process.exit();
      }, 3000);
      return;
    } else if (!container.discord.servers[container.config.voice_server]) {
      setTimeout(() => {
        console.log(`${chalk.yellow('[Warning]: No server connected. Please add this bot to your server by visiting the following url, and then restart the bot:')}\n${container.discord.inviteURL}`);
        process.exit();
      }, 3000);
      return;
    } else if (container.sio) {
      // we need to rejoin voice here
      container.fn.startVoiceProtocols();
      container.fn.logEndpoints();
      return;
    }

    // proceed with bootup
    const server = container.web.listen(container.config.port, () => {
      container.sio = socketio.listen(server);

      // handle individual socket connections
      container.sio.on('connection', (socket) => {
        socket.emit('connection', {});

        socket.on('watchVoiceChannel', (data) => {
          if (data.channelID && container.discord.channels[data.channelID]) {

            // join the matching socketio room for session alerts
            socket.join(data.channelID);

            // return a list of human users to the socket
            const userList = Object.keys(
              container.discord.channels[data.channelID].members
            );
            const humanUsers = userList.map((x) => {
              return container.fn.getHumanUserById(x);
            });

            socket.emit('alert', {
              type: 'userList',
              humanUsers: humanUsers
            });
          }
        });
      });

      container.fn.logEndpoints();
    });

    // join the preferred voice channel and register events to the sockets
    container.fn.startVoiceProtocols();

    // monitor new member events -----------------------------------------------
    container.discord.on('guildMemberAdd', (member, event) => {
      // get the user and server data
      const userID     = event.d.user.id;
      const serverID   = event.d.guild_id;
      const humanUser  = container.fn.getHumanUserById(userID);
      const serverData = container.fn.getServerDataById(serverID);

      if (humanUser) {
        container.sio.sockets.emit('alert', {
          type: 'guildMemberAdd',
          humanUser: humanUser,
          serverData: serverData
        });
      }
    });

    // monitor other discord related events that we care about -----------------
    container.discord.on('any', (event) => {
      switch(event.t) {
        case 'VOICE_STATE_UPDATE':
          const humanUser = container.fn.getHumanUserById(event.d.user_id);
          if (event.d.channel_id) {
            // user connected
            container.sio.sockets.emit(event.d.channel_id).emit('alert', {
              type: 'voiceConnect',
              channel: event.d.channel_id,
              humanUser: humanUser
            });
          } else {
            // user disconnected
            container.sio.sockets.emit('alert', {
              type:'voiceDisconnect',
              humanUser: humanUser
            });
          }
          break;
      }
    });
  });

  container.discord.on('disconnect', (event) => {
    // log the disconnect event and reconnect in 5 seconds
    container.fn.leaveAllVoiceChannels();
    if (event) {
      console.log(event);
    }
    console.log('reconnecting in 7 seconds...');
    setTimeout(container.discord.connect, 7000);
  });
})();
