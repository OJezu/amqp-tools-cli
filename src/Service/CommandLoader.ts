import Bunyan from "bunyan";
import BunyanFormat from "bunyan-format";
import {Argv} from "yargs";

import CommandInterface from "../Command/CommandInterface";
import AmqpConfiguration from "../Configuration/AmqpConfiguration";
import CommandConfiguration from "../Configuration/CommandConfiguration";
import AmqpConnector from "./AmqpConnector";

export default class CommandLoader {
  private readonly _commands: {[commandName: string]: CommandInterface<CommandConfiguration>};
  private _yargs: Argv;

  constructor({yargs}: {yargs: Argv}) {
    this._commands = {};
    this._yargs = yargs;
    yargs.demandCommand(1);
    AmqpConfiguration.decorateYargs(yargs);
    CommandConfiguration.decorateYargs(yargs);
  }

  public registerCommand(command: CommandInterface<CommandConfiguration>): void {
    this._commands[command.commandName()] = command;
    this._yargs.command(command.commandName(), command.commandDescription(), (yargs: Argv): Argv => {
      return command.decorateYargs(yargs);
    });
  }

  public async run(): Promise<void> {
    const argv = this._yargs.argv;
    const commandName = argv._[0];
    argv._ = argv._.slice(1);

    if (!this._commands.hasOwnProperty(commandName)) {
      throw new Error(`Unrecognized command ${commandName}`);
    }

    const command = this._commands[commandName];
    const configuration = command.getConfiguration(argv);

    const logger = Bunyan.createLogger({
      level: "debug",
      name: "amqp-consume",
      streams: [
        {
          level: configuration.logLevel(),
          stream: new BunyanFormat({outputMode: "long"}),
          type: "stream",
        },
      ],
    });

    try {
      const amqpConnector = new AmqpConnector({
        amqpConfiguration: configuration.amqpConfiguration(),
        logger,
        onError: (connectionError) => {
          if (connectionError) {
            logger.fatal(connectionError);
          } else {
            logger.info("Disconnected from amqp");
          }
        },
      });

      return await command.run({logger, amqpConnector, configuration});
    } catch (e) {
      logger.fatal(e);
      process.exit(1);
    }
  }
}
