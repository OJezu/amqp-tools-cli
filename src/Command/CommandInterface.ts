import Logger from "bunyan";
import {Argv} from "yargs";

import CommandConfiguration from "../Configuration/CommandConfiguration";
import AmqpConnector from "../Service/AmqpConnector";

/**
 * TypeScript does not like static abstract methods, or static methods on interfaces, so this is more of
 * a "command description" rather than a true command-representing class.
 */
export default interface CommandInterface<C extends CommandConfiguration> {
  commandName(): string;
  commandDescription(): string;
  decorateYargs(yargs: Argv): Argv;
  run(
    {logger, amqpConnector, configuration}:
    {logger: Logger, amqpConnector: AmqpConnector, configuration: C},
  ): Promise<void>;
  getConfiguration(argv: any): C;
}
