import {Argv} from "yargs";

import {Options} from "amqplib";
import CommandConfiguration from "./CommandConfiguration";
import Publish = Options.Publish;

export default class MessagePublishConfiguration extends CommandConfiguration {
  public static decorateYargs(yargs: Argv): Argv {
    return CommandConfiguration.decorateYargs(yargs)
      .option("exchange", {
        demandOption: true,
        type: "string",
      })
      .option("routing-key", {
        demandOption: true,
        type: "string",
      })
      .option("content-type", {
        type: "string",
      })
      // https://github.com/yargs/yargs/issues/1324 - disabled, as this eats quotes
      // .command("$0 <content>", "Message content, if missing, stdin will be used")
    ;
  }

  private readonly _routingKey: string;
  private readonly _exchangeName: string;
  private readonly _contentType: string;
  private readonly _content: string;

  constructor(args: any) {
    super(args);

    this._exchangeName = args.exchange;
    this._routingKey = args.routingKey;
    this._contentType = args.contentType;
    this._content = args._[0];
  }

  public exchangeName(): string {
    return this._exchangeName;
  }

  public routingKey(): string {
    return this._routingKey;
  }

  public messageContent(): string | null {
    return this._content;
  }

  public messageOptions(): Publish {
    return {
      contentType: this._contentType,
    };
  }
}
