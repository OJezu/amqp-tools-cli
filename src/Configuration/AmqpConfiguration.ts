import {Options} from "amqplib";
import {Argv} from "yargs";

/**
 * Configuration needed to connect to amqp.
 *
 * Embedded in CommandConfiguration
 */
export default class AmqpConfiguration {

  public static decorateYargs(yargs: Argv): Argv {
    return yargs
      .option("hostname", {
        default: "localhost",
        type: "string",
      })
      .option("port", {
        default: 5672,
        type: "number",
      })
      .option("user", {
        type: "string",
      })
      .option("password", {
        type: "string",
      })
      .option("vhost", {
        default: "/",
        type: "string",
      })
      .option("heartbeat", {
        default: 60,
        type: "number",
      })
    ;
  }
  private readonly _options: Options.Connect;

  constructor(argv: any) {
    this._options = {
      heartbeat: argv.heartbeat,
      hostname: argv.hostname,
      password: argv.password,
      port: argv.port,
      protocol: "amqp",
      username: argv.user,
      vhost: argv.vhost,
    };
  }

  public options(): Options.Connect {
    return this._options;
  }
}
