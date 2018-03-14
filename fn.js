module.exports = function fn(container) {

  const module = {
    schedules: {}
  };
  const chalk = require('chalk');

  module.getServerDataById = (serverID) => {
    const server = container.discord.servers[serverID];
    return {
      name: server.name,
      icon: (server.icon)
        ? `https://cdn.discordapp.com/icons/${serverID}/${server.icon}`
        : null
    };
  };

  module.getHumanUserById = (userID) => {
    const user = container.discord.users[userID];
    if (user && !user.bot) {
      const channel = container.discord.servers[container.config.voice_server];
      const nick    = channel.members[user.id].nick;

      user.displayname = nick || user.username;
      return user;
    } else {
      return false;
    }
  };

  module.leaveAllVoiceChannels = (callback) => {
    Object.keys(container.discord._vChannels).forEach((key) => {
      container.discord.leaveVoiceChannel(key, () => {
        if (callback) {
          callback();
        }
      });
    });
  };

  module.startVoiceProtocols = () => {
    container.discord.joinVoiceChannel(container.config.voice_channel,
    (error, events) => {
      if (!events) {
        return;
      }
      events.on('speaking', (userID, SSRC, speakingBool) => {
        const channelID = container
                          .discord.servers[container.config.voice_server]
                          .members[userID].voice_channel_id;
        container.sio.sockets.in(channelID).emit('alert', {
          type: 'speech',
          humanUser: module.getHumanUserById(userID),
          speaking: speakingBool
        });
      });
    });
  };

  module.logEndpoints = () => {
    const hostname = module.getHostName();
    console.log(`Voice monitor: ${chalk.green('[OK]')}\n - ` + chalk.cyan(`${hostname}:${container.config.port}/voice_chat_monitor?vc=${container.config.voice_channel}`));
    console.log(`Vew member alerts: ${chalk.green('[OK]')}\n - ` + chalk.cyan(`${hostname}:${container.config.port}/new_member_alerts`));
  };

  module.getHostName = () => {
    return container.config.hostname || 'http://127.0.0.1';
  };

  module.scheduler = (name, time, callback) => {

    container.tasks = container.tasks || {};

    if (container.tasks[name]) {
      // fail silently for now since plugins will attempt to
      // reregister tasks on reconnect
    } else {
      container.tasks[name] = {
        interval: time,
        action: setInterval(function() {
          process.nextTick(function() {
            callback();
          });
        }, time),
      };

      callback();
    }
  };

  return module;
};
