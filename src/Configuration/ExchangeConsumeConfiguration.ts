import {Argv} from "yargs";

import ConsumeConfiguration from "./ConsumeConfiguration";

export default class ExchangeConsumeConfiguration extends ConsumeConfiguration {
  public static decorateYargs(yargs: Argv): Argv {
    return ConsumeConfiguration.decorateYargs(yargs)
      .option("exchange", {
        demandOption: true,
        type: "string",
      })
      .option("routing-key", {
        demandOption: true,
        type: "string",
      })
    ;
  }

  private readonly _routingKey: string;
  private readonly _exchangeName: string;

  constructor(args: any) {
    super(args);

    this._exchangeName = args.exchange;
    this._routingKey = args.routingKey;
  }

  public exchangeName(): string {
    return this._exchangeName;
  }

  public routingKey(): string {
    return this._routingKey;
  }
}
