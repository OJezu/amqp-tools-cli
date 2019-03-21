import {Argv} from "yargs";

import AmqpConfiguration from "./AmqpConfiguration";

/**
 * Configuration options common for all commands
 */
class CommandConfiguration {

  public static decorateYargs(yargs: Argv): Argv {
    return yargs
      .option("log-level", {
        default: "warn",
        type: "string",
      })
    ;
  }
  private readonly _amqpConfiguration: AmqpConfiguration;
  private readonly _logLevel: "info" | "trace" | "debug" | "warn" | "error" | "fatal";

  constructor(args: any) {
    this._amqpConfiguration = new AmqpConfiguration(args);
    this._logLevel = args.logLevel;
  }

  public logLevel(): "info" | "trace" | "debug" | "warn" | "error" | "fatal" {
    return this._logLevel;
  }

  public amqpConfiguration(): AmqpConfiguration {
    return this._amqpConfiguration;
  }
}

export default CommandConfiguration;
