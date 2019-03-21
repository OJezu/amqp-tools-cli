import {Argv} from "yargs";

import ConsumeConfiguration from "./ConsumeConfiguration";

export default class QueueConsumeConfiguration extends ConsumeConfiguration {
  public static decorateYargs(yargs: Argv): Argv {
    return ConsumeConfiguration.decorateYargs(yargs)
      .option("queue", {
        demandOption: true,
        type: "string",
      })
    ;
  }

  private readonly _queueName: string;

  constructor(args: any) {
    super(args);

    this._queueName = args.queue;
  }

  public queueName(): string {
    return this._queueName;
  }
}
